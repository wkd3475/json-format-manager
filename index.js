const Client = require('node-rest-client').Client;
const stringify = require('json-stable-stringify');

//TODO : 결함 허용 기능 추가할 것

const debugMode = false;

class Utils {
    getType = (target) => {
        if (this.isJFMObject(target)) {
            return "JFMObject";
        } else if (typeof(target) === "object" && target !== null && !Array.isArray(target) ) {
            return "PureObject";
        } else if (typeof(target) === "object" && target !== null && Array.isArray(target)) {
            return "Array";
        }
        return "Scala";
    }

    getFormat = (object) => {
        let arr = [];
        for (let key in object) {
            arr.push(key);
        }
        return arr.sort();
    }

    isJFMObject = (object) => {
        if (object != null && typeof(object) === "object" && !Array.isArray(object)) {
            if (Object.keys(object).length == 2) {
                if (typeof(object["i"]) !== "undefined" && typeof(object["d"]) !== "undefined")
                    return true;

                if (typeof(object["i"]) !== "undefined" && typeof(object["c"]) !== "undefined")
                    return true
            }
        }
        return false;
    }
}
const utils = new Utils();

class JFMClient {
    constructor() {
        this.cache = {};
        this.client = new Client();
    }

    isCached = (format) => {
        if (typeof(format) === "string" && typeof(this.cache[format]) !== "undefined") {
            return true;
        } else if (typeof(format) === "object") {
            let formatStr = stringify(format);
            if (typeof(this.cache[formatStr]) !== "undefined") {
                return true;
            }
        }
        return false;
    }

    newMessage = (object) => {
        return stringify(this.transformToJFMObject(object));
    }

    compress = (arr) => {
        let result = [];

        let before = null;
        let temp = [];
        const NOT_JFM_OBJECT = 1;

        for (let element of arr) {
            if (utils.isJFMObject(element)) {
                if (element["i"] == before) {
                    temp.push(element["d"]);
                } else {
                    if (before == null) {
                        before = element["i"];
                    } else if (before !== NOT_JFM_OBJECT) {
                        if (temp.length > 1) {
                            result.push({"i": before, "c": temp});
                            temp = [];
                        } else {
                            result.push({"i": before, "d": temp[0]});
                            temp = [];
                        }
                        before = element["i"];
                    }
                    temp = [element["d"]];
                }
            } else {
                if (before == null) {
                    before = NOT_JFM_OBJECT;
                } else if (before != NOT_JFM_OBJECT) {
                    if (temp.length > 1) {
                        result.push({"i": before, "c": temp});
                        temp = [];
                    } else {
                        result.push({"i": before, "d": temp[0]});
                        temp = [];
                    }
                }
                result.push(element);
            }
        }
        if (temp.length > 1) {
            result.push({"i": before, "c": temp});
        } else if (temp.length == 1) {
            result.push({"i": before, "d": temp[0]});
        } 

        return result;
    }

    transformToJFMObject = (target) => {
        let type = utils.getType(target);
        if (type == "Scala") {
            return target;
        }

        if (type == "PureObject") {
            let format = utils.getFormat(target);
            let formatStr = stringify(format);
            if (this.isCached(formatStr)) {
                let message = {
                    "i": this.cache[formatStr],
                    "d": []
                }

                for (let key of format) {
                    message["d"].push(this.transformToJFMObject(target[key]));
                }
                return message;
            } else {
                return target;
            }
        }

        if (type == "Array") {
            let arr = [];
            for (let element of target) {
                arr.push(this.transformToJFMObject(element));
            }
            return this.compress(arr);
        }
    }

    registFormat(format, formatId) {
        let str = stringify(format);
        this.cache[str] = formatId;
        if (debugMode) {
            console.log("registFormat : new cache");
            console.log(str+": "+formatId);
        }
    }

    send = (url, object) => {
        let jfmObject = this.newMessage(object);
        let client = this.client;
        let args = {
            data: jfmObject,
            headers: { "Content-Type": "application/json"}
        }

        let req = client.post(url, args, (data, response) => {
            for (let formatId in data.registration) {
                this.registFormat(data.registration[formatId], formatId);
            }
        })

        req.on('error', (err) => {
            console.log('request error...');
            //TODO : error control
        });
    }
}

module.exports.JFMClient = new JFMClient();

class JFMServer {
    constructor() {
        this.cache = {};
        // this.formatArray = [];
    }

    isCached = (formatId) => {
        if (typeof(this.cache[formatId]) !== "undefined") {
            return true;
        }
        return false;
    }

    getFormatById = (formatId) => {
        return this.cache[formatId];
    }

    getUncachedFormatArray = (object) => {
        if (utils.getType(object) == "Scala") {
            return [];
        }
        let formatArray = [];
        let format = utils.getFormat(object);
        formatArray.push(format);

        for (let key in object) {
            let type = utils.getType(object[key]);
            if (type == "PureObject") {
                for (let data of this.getUncachedFormatArray(object[key])) {
                    formatArray.push(data);
                }
            } else if (type == "Array") {
                for (let element of object[key]) {
                    for (let data of this.getUncachedFormatArray(element)) {
                        formatArray.push(data);
                    }
                }
            } else if (tpye == "JFMObject") {

            }
        }
        return formatArray;
    }

    // registFormat id값을 순차적으로 부여, p2p에서 유리함
    // registFormat = (format) => {
    //     let str = stringify(format);
    //     let index = this.formatArray.indexOf(str);
    //     if (index === -1) {
    //         this.formatArray.push(str);
    //         let id = this.formatArray.indexOf(str);
    //         this.cache[id] = format;
    //         if (debugMode) {
    //             console.log("registFormat : new cache");
    //             console.log(format);
    //         }
    //         return id.toString();
    //     }
        
    //     return index.toString();
    // }

    registFormat = (format) => {
        let str = stringify(format);
        let id = this.hashFnv32a(str);
        if (!this.isCached(id)) {
            this.cache[id] = format;
            if (debugMode) {
                console.log("registFormat : new cache");
                console.log(format);
            }
            return id.toString();
        }
        
        return id.toString();
    }

    decompress = (arr) => {
        let result = [];
        for (let element of arr) {
            let formatId = element["i"];

            if (typeof(element["c"]) !== "undefined") {
                for (let d of element["c"]) {
                    result.push({"i": formatId, "d": d});
                }
            } else {
                result.push(element);
            }
        }
        return result;
    }

    parse = () => (req, res, next) => {
        let data = "";
        req.on('data', (chunk) => data += chunk);
        req.on('end', () => {
            let jfm = {
                "ok": true
            };
            let object = JSON.parse(data);
            req.body = this.transformToObject(object, jfm);
            res.jfm = jfm;
            next()
        });
    }

    transformToObject(target, jfm) {
        let type = utils.getType(target);
        if (type == "Scala")
            return target;

        if (type == "PureObject") {
            let obj = {};
            if (typeof(jfm["registration"]) === "undefined") {
                jfm.registration = {};
            }
            let format = utils.getFormat(target);
            jfm.registration[this.registFormat(format)] = format;

            for (let key of format) {
                obj[key] = this.transformToObject(target[key], jfm);
            }
            return obj;
        }

        if (type == "JFMObject") {
            if (this.isCached(target["i"])) {
                let format = this.getFormatById(target["i"]);
                let obj = {};

                for (let i=0; i<format.length; i++) {
                    obj[format[i]] = this.transformToObject(target["d"][i], jfm);
                }
                return obj;
            } else {
                jfm.ok = false;
                if (typeof(jfm.remove) === "undefined") {
                    jfm.remove = [];
                }
                jfm.remove.push(target["i"]);
                return {"err": "JFM : Not exist id "+target["i"]};
            }
        }

        if (type == "Array") {
            let arr = [];
            let decompressedArr = this.decompress(target)
            
            for (let element of decompressedArr) {
                arr.push(this.transformToObject(element, jfm));
            }
            return arr;
        }
    }

    hashFnv32a(str, asString, seed) {
        var i, l,
            hval = (seed === undefined) ? 0x811c9dc5 : seed;
    
        for (i = 0, l = str.length; i < l; i++) {
            hval ^= str.charCodeAt(i);
            hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
        }
        if( asString ){
            return ('0000000' + (hval >>> 0).toString(16)).substr(-8);
        }
        var result = (((hval >>> 0) / 1000000) | 0);
        return result;
    }
}

module.exports.JFMServer = new JFMServer()