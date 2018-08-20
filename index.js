const util = require('util')
const epubReader = require('epub')
const isChinese = require('is-chinese')
const nodejieba = require("nodejieba")
const mdbg = require('mdbg')
const createCsvWriter = require('csv-writer').createObjectCsvWriter

mdbg.init()

const epub = new epubReader("113726.epub")
const termsMap = new Map()
const terms = new Array()

if (epub) {
    epub.on("error", function (err) {
        console.log(err)
    })
    epub.on("end", function () {
        readEpub(epub)
            .then(cvsTerms)
            .catch(err => console.log(err))
    })
    epub.parse()
}
else {
    console.log("no epub")
}

async function readEpub(epub) {
    console.log(epub.metadata.title)

    try {
        const findTerms = epub.toc.map(cnt => readChapter(epub, cnt.id))
        await Promise.all(findTerms)

        for (let termInfo of termsMap.values()) {
            terms.push(termInfo)
        }
        terms.sort((t1, t2) => t2.frequency - t1.frequency)

        const defineTerms = terms.map(updateTermDefinition)
        const termData = await Promise.all(defineTerms)

        return termData
    }
    catch (err) {
        console.log(err)
    }
}

function readChapter(epub, id) {
    return new Promise((resolve, reject) => {
        const chapter = epub.toc.find(chap => chap.id === id)

        //not more than 99 chapters...
        const chapterIndex = `ch${chapter.order > 9 ? chapter.order : '0' + chapter.order}`

        epub.getChapter(id, function (err, text) {
            if (err) {
                reject(err)
            }

            const result = nodejieba.cut(text)
            result.forEach(term => {
                if (isChinese(term)) {
                    let termInfo = termsMap.get(term)
                    if (termInfo) {
                        termInfo.frequency++
                        termInfo.chapters.add(chapterIndex)
                    }
                    else {
                        termInfo = { term: term, frequency: 1, chapters: new Set([chapterIndex]) }
                        termsMap.set(term, termInfo)
                    }
                }
            })

            resolve(termsMap)
        })
    })
}

async function updateTermDefinition(termInfo) {
    const term = termInfo.term
    let termData = { ...termInfo, simplified: term, traditional: term }
    delete termData.term

    termData.chaptersTag = getChaptersTag(termData.chapters)
    delete termData.chapters

    try {
        const dict = await mdbg.getByHanzi(term)

        let definitions = new Array()
        for (let defId in dict.definitions) {
            definitions.push(dict.definitions[defId])
        }

        termData = {
            ...termData,
            simplified: dict.simplified,
            traditional: dict.traditional,
            pinyin: definitions.map(d => d.pinyin).join(" / "),
            zhuyin: definitions.map(d => d.zhuyin).join(" / "),
            translation: definitions.map(d => d.translations.join("; ")).join(" / ")
        }
    }
    catch (err) {
        //console.log(err)
    }

    return termData;
}

function getChaptersTag(chapters) {
    return Array.from(chapters).sort().join(" ")
}

async function cvsTerms(termData) {
    const csvWriter = createCsvWriter({
        path: 'terms.txt',
        header: [
            { id: 'traditional', title: 'traditional' },
            { id: 'simplified', title: 'simplified' },
            { id: 'frequency', title: 'frequency' },
            { id: 'pinyin', title: 'pinyin' },
            { id: 'zhuyin', title: 'zhuyin' },
            { id: 'translation', title: 'translation' },
            { id: 'chaptersTag', title: 'chapters' }
        ],
    });

    csvWriter.writeRecords(termData)       // returns a promise
        .then(() => {
            console.log('...Done');
        });
}