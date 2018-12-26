const epubReader = require('epub')
const isChinese = require('is-chinese')
const nodejieba = require("nodejieba")
const mdbg = require('mdbg')
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const arg = require('arg')
const path = require('path');

const args = arg({
    // Types
    '--ebook':    String,
    '--deck':    String,
 
    // Aliases
    '-e':        '--ebook',
    '-d':        '--deck',
});

mdbg.init()

const ebookPath = path.resolve(args["--ebook"])
const deckPath = path.resolve(args["--deck"])

//TODO refactor into command line app
const epub = new epubReader(ebookPath)
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
                    let termContext = termsMap.get(term)
                    if (termContext) {
                        termContext.frequency++
                        termContext.chapters.add(chapterIndex)
                    }
                    else {
                        termContext = { term: term, frequency: 1, chapters: new Set([chapterIndex]) }
                        termsMap.set(term, termContext)
                    }
                }
            })

            resolve(termsMap)
        })
    })
}

async function updateTermDefinition(termContext) {
    const term = termContext.term

    let termData = { ...termContext, simplified: term, traditional: term }
    delete termData.term

    termData.chaptersTag = `fr${termData.frequency} ${getChaptersTag(termData.chapters)}`
    delete termData.chapters

    let entries = new Array()

    try {
        const dict = await mdbg.getByHanzi(term)
        //term is in dictionary

        //TODO correct old variant substitution
        const entry = extractFromDict(dict);
        entries.push(entry)
    }
    catch (err) {
        //full term is not in dictionary
        //give a definition character by character
        const termparts = term.split('')
        const extractAll = termparts.map(async tp => {
            try {
                const dictPart = await mdbg.getByHanzi(tp)
                const partEntry = extractFromDict(dictPart)
                entries.push(partEntry)
            } catch (err) {
                const entry = {
                    simplified: tp,
                    traditional: tp,
                    pinyin: "",
                    zhuyin: "",
                    translations: ""
                }
                entries.push(entry)
            }
        })

        await Promise.all(extractAll)
    }
    
    const fullentry = {
        simplified: entries.map(e => e.simplified).join(''),
        traditional: entries.map(e => e.traditional).join(''),
        pinyin: entries.map(e => e.pinyin).join(" | "),
        zhuyin: entries.map(e => e.zhuyin).join(" | "),
        translations: entries.map(e => e.translations).join(" | ")
    }
    
    delete termData.simplified
    delete termData.traditional

    termData = { ...termData, ...fullentry }

    return termData;
}

function extractFromDict(dictEntry, termData) {

    let definitions = new Array();
    for (let defId in dictEntry.definitions) {
        definitions.push(dictEntry.definitions[defId]);
    }

    const entry = {
        simplified: dictEntry.simplified,
        traditional: dictEntry.traditional,
        pinyin: definitions.map(d => d.pinyin).join(" / "),
        zhuyin: definitions.map(d => d.zhuyin).join(" / "),
        translations: definitions.map(d => d.translations.join("; ")).join(" / ")
    }

    return entry;
}

function getChaptersTag(chapters) {
    return Array.from(chapters).sort().join(" ")
}

async function cvsTerms(termData) {
    const csvWriter = createCsvWriter({
        path: deckPath,
        header: [
            { id: 'traditional', title: 'traditional' },
            { id: 'simplified', title: 'simplified' },
            { id: 'frequency', title: 'frequency' },
            { id: 'pinyin', title: 'pinyin' },
            { id: 'zhuyin', title: 'zhuyin' },
            { id: 'translations', title: 'translations' },
            { id: 'chaptersTag', title: 'chapters' }
        ],
    });

    csvWriter.writeRecords(termData)
        .then(() => {
            console.log('...Done');
        });
}