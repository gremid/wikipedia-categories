const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
chai.should();

const moment = require("moment");
const categories = require("./index");

describe("Wikipedia Category dump", function() {
    this.timeout(30000);

    const { latest, triples, parse, store } = categories;

    it("is not older than a week", () => {
        const oneWeekAgo = moment().subtract(1, "week").format("YYYYMMDD");
        return latest().should.eventually.satisfy(ts => (ts >= oneWeekAgo));
    });

    it("can be downloaded and stored", () => {
        return latest()
            .then(triples)
            .then(parse)
            .then(store)
            .should.eventually.be.fulfilled;
    });
});

describe("Loaded Category dump", function() {
    this.slow(0);

    const { load, containment } = categories;

    let loaded;

    before(() => loaded = load());

    it("can be retrieved", () => {
        return loaded.should.eventually.be.an("object");
    });

    it("has more than 300,000 entries", () => {
        return loaded.should.eventually.satisfy(
            graph => (Object.keys(graph.ids).length > 300000)
        );
    });

    it("can be queried", () => {
        return loaded.then(graph => containment(
            graph,
            "https://de.wikipedia.org/wiki/Kategorie:Treibhausgasemission"
        )).should.eventually.be.an("object");
    });
});
