const { join } = require("path");
const fs = require("fs");
const zlib = require("zlib");

const fetch = require("node-fetch");
const N3 = require("n3");

const { getLiteralValue } = N3.Util;

const baseUrl = "https://dumps.wikimedia.org/other/categoriesrdf";

function latest(lang="de") {
    const latestUrl = `${baseUrl}/lastdump/${lang}wiki-categories.last`;
    return fetch(latestUrl).then(res => res.text().then(ts => ts.trim()));
}

function triples(ts, lang="de") {
    const url = (ts) =>`${baseUrl}/${ts}/${lang}wiki-${ts}-categories.ttl.gz`;
    return fetch(url(ts))
        .then(res => res.body)
        .then(gzStream => gzStream.pipe(zlib.createGunzip()));
}

function parse(ttlStream) {
    return new Promise((resolve, reject) => {
        let count = 0;
        const graph = {
            ids: {},
            iris: {},
            labels: {},
            containment: {}
        };
        const { iris, ids, labels, containment } = graph;
        const registered = (iri) => {
            let id = ids[iri];
            if (id) {
                return id;
            }

            id = ids[iri] = ++count;
            iris[id] = iri;

            return id;
        };
        ttlStream
            .pipe(N3.StreamParser())
            .on("data", (triple) => {
                const { subject, predicate, object } = triple;
                switch (predicate) {
                case "http://www.w3.org/1999/02/22-rdf-syntax-ns#type":
                    switch (object) {
                    case "https://www.mediawiki.org/ontology#Category":
                        registered(subject);
                    }
                    break;
                case "http://www.w3.org/2000/01/rdf-schema#label": {
                    labels[registered(subject)] = getLiteralValue(object);
                    break;
                }
                case "https://www.mediawiki.org/ontology#isInCategory": {
                    const sub = registered(subject);
                    const sup = registered(object);
                    containment[sub] = containment[sub] || [];
                    containment[sub].push(sup);
                    break;
                }
                }
            })
            .on("error", reject)
            .on("end", () => resolve(graph));
    });
}

function storedPath(lang="de") {
    return join(__dirname, `categories_graph_${lang}.json`);
}

function store(graph, lang="de") {
    const path = storedPath(lang);
    return new Promise((resolve, reject) => fs.writeFile(
        path, JSON.stringify(graph),
        (err) => err ? reject(err) : resolve(path)
    ));
}

function load(lang="de") {
    const path = storedPath(lang);
    return new Promise((resolve, reject) => fs.readFile(
        path,
        (err, data) => err ? reject(err) : resolve(JSON.parse(data))
    ));
}

function cached(lang="de") {
    const stored = new Promise((resolve) => fs.stat(
        storedPath(lang),
        (err, stat) => err ? resolve(false) : resolve(stat.isFile())
    ));

    return stored.then(exists => {
        if (exists) {
            return load(lang);
        }
        return latest()
            .then(triples).then(parse)
            .then(graph => store(graph, lang).then(() => graph));
    });
}

function containment(graph, iri) {
    const { ids, containment } = graph;
    const result = {};
    const frontier = [];
    if (ids[iri]) {
        frontier.push(ids[iri]);
    }
    while (frontier.length > 0) {
        const id = frontier.shift();
        if (result[id]) {
            continue;
        }
        result[id] = true;

        (containment[id] || []).forEach(sup => frontier.push(sup));
    }
    return result;
}

module.exports = { latest, triples, parse, store, load, cached, containment };
