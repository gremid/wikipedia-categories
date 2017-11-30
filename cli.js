#!/usr/bin/env node

const { argv, stdout } = process;

const qs = require("querystring");

const fetch = require("node-fetch");

const categories = require("./index.js");

function pageCategories(title) {
    const url = ["https://de.wikipedia.org/w/api.php", qs.stringify({
        action: "query",
        format: "json",
        prop: "categories",
        clshow: "!hidden",
        cllimit: 25,
        titles: title
    })].join("?");

    return fetch(url)
        .then(res => res.json())
        .then(results => {
            const pages = ((results.query || {}).pages || {});
            return Object.keys(pages)
                .map(id => pages[id])
                .filter(page => page.title == title);
        })
        .then(pages => {
            const categories = Object.keys(pages.reduce(
                (categories, page) => (page.categories || [])
                    .map(c => c.title.replace(/^Kategorie:/, ""))
                    .reduce(
                        (categories, category) => Object.assign(
                            categories, { [category]: true }
                        ),
                        categories
                    ),
                {}
            )).sort();

            return { title, categories };
        });
}

const pages = Promise.all(argv.slice(2).map(pageCategories));
const graph = categories.cached();

Promise.all([pages, graph]).then(input => {
    const [pages, graph] = input;

    const { labels, iris } = graph;
    const labels2Id = Object.keys(labels).reduce(
        (idx, id) => Object.assign(idx, { [labels[id]]: id }),
        {}
    );

    pages.forEach((page, pi) => {
        if (pi > 0) {
            stdout.write("\n");
        }
        stdout.write(`# ${page.title}\n`);

        const pageIds = page.categories
              .map(c => labels2Id[c])
              .filter(c => c);

        if (pageIds.length == 0) {
            return;
        }

        stdout.write("\n## Kategorien\n\n");

        const containment = {};
        pageIds.forEach(id => {
            Object.assign(containment, categories.containment(graph, iris[id]));
            stdout.write(`* [${labels[id]}](${iris[id]})\n`);
        });

        const superCategories = Object.keys(containment)
              .filter(id => pageIds.indexOf(id) < 0)
              .map(id => {
                  const label = labels[id];
                  const iri = iris[id];
                  return { id, label, iri };
              })
              .sort((a, b) => a.label.localeCompare(b.label));


        if (superCategories.length == 0) {
            return;
        }

        stdout.write("\n## Übergeordnete Kategorien\n\n");

        superCategories.forEach(sup => {
            const { label, iri } = sup;
            stdout.write(`* [${label}](${iri})\n`);
        });
    });
});
