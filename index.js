const util = require('util')
const epubReader = require('epub')
const isChinese = require('is-chinese')
const nodejieba = require("nodejieba")
const createCsvWriter = require('csv-writer').createObjectCsvWriter

const epub = new epubReader("113726.epub")
const terms = new Array()
const termsSet = new Set()

const rethrow = err => {
    console.log(`error ${err}`);
    throw err;
}

if (epub) {
    epub.on("error", function (err) {
        rethrow(err)
    })
    epub.on("end", function () {
        readEpub(epub).then(cvsTerms)
    })
    epub.parse()
}
else {
    console.log("no epub")
}

async function readEpub(epub) {
    console.log(epub.metadata.title)

    const findTerms = epub.toc.map(cnt => readChapter(epub, cnt.id))
    await Promise.all(findTerms);

    return termsSet;
}

function readChapter(epub, id) {
    return new Promise((resolve, reject) => {
        epub.getChapter(id, function (err, text) {
            if (err) {
                reject(err)
            }
            const result = nodejieba.cut(text)
            result.forEach(term => {
                if (isChinese(term))
                {
                    if(!termsSet.has(term))
                    {
                        terms.push(term)
                        termsSet.add(term)
                    }
                }
            })
            resolve(terms)
        })
    })
}

async function cvsTerms() {
    const csvWriter = createCsvWriter({
        path: 'terms.txt',
        header: [
            { id: 'term', title: 'TERM' },
        ]
    });

    const records = terms.map(t => {
        return { term: t };
    })

    csvWriter.writeRecords(records)       // returns a promise
        .then(() => {
            console.log('...Done');
        });
}