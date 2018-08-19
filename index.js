const util = require('util')
const epubReader = require('epub')
const isChinese = require('is-chinese')
const nodejieba = require("nodejieba")
const createCsvWriter = require('csv-writer').createObjectCsvWriter

const epub = new epubReader("113726.epub")
const terms = new Map()

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

    return terms;
}

function readChapter(epub, id) {
    return new Promise((resolve, reject) => {
        const chapter = epub.toc.find(chap => chap.id === id)
        
        //no more than 99 chapters...
        const chapterIndex = `ch${chapter.order > 9 ? chapter.order : '0' + chapter.order}`

        epub.getChapter(id, function (err, text) {
            if (err) {
                reject(err)
            }
            const result = nodejieba.cut(text)
            result.forEach(term => {
                if (isChinese(term)) {
                    let termInfo = terms.get(term)
                    if (termInfo) {
                        termInfo.frequency++
                        termInfo.chapters.add(chapterIndex)
                    }
                    else {
                        termInfo = { term: term, frequency: 1, chapters: new Set([chapterIndex]) }
                        terms.set(term, termInfo)
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
            { id: 'term', title: 'term' },
            { id: 'frequency', title: 'frequency' },
            { id: 'chapters', title: 'chapters' }
        ]
    });

    const allTerms = new Array()
    for (let termInfo of terms.values()) {
        allTerms.push(termInfo)
    }
    allTerms.sort((t1, t2) => t2.frequency - t1.frequency)

    const records = allTerms.map(t => {
        return { ...t, chapters: Array.from(t.chapters).sort().join(" ") };
    })

    csvWriter.writeRecords(records)       // returns a promise
        .then(() => {
            console.log('...Done');
        });
}