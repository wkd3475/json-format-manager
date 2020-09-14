const Client = require('node-rest-client').Client;

class JFMClient {
    constructor() {
        this.objectNameToHashID = {};
        this.client = new Client();
        this.seperator = ';';
    }

    sendHttp(url, objectName, objectArray) {
        var client = this.client;
        var receiveMessage = (objectName, data) => {return this.receiveMessage(objectName, data)}

        var message = this.newMessage(objectName, objectArray);
        var args = {
            data: JSON.stringify(message),
            headers: { "Content-Type": "application/json"}
        }
        
        var req = client.post(url, args, function (data, response) {
            var isRegisted = receiveMessage(data);
            if (isRegisted == false) {
                console.log("<JFClient:send> Not exist hashID. Try to regist format");
                args['data'] = JSON.stringify(objectArray);

                client.post(url, args, function (data, response) {
                    receiveMessage(data);
                })
            }
        });

        req.on('error', function (err) {
            console.log('request error...');
        });
    }

    receiveMessage(data) {
        if (typeof(data['registry']) !== 'undefined') {
            for (var r of data['registry']) {
                this.objectNameToHashID[r['n']] = r['h'];
                console.log('<JFClient:receiveMessage> new registry : ');
                console.log(r);
            }
        } 

        if (typeof(data['err']) !== 'undefined') {
            console.log(data['err']);
        }
        
        return data['ok'];
    }

    isRegisted(objectName) {
        if (typeof(this.objectNameToHashID[objectName]) !== 'undefined') {
            return true;
        }
        return false;
    }

    // (objectName, [object, ..., object]) => {'h': hashID, 'd': [data, ..., data]}
    // (objectName, [object, ..., object]) => {'n': objectName, 'o': [object, ..., object]}
    // (objectName, object) => {'h': hashID, 'd': data}
    newMessage(objectName, objectArray) {
        if (this.isRegisted(objectName)) {
            var message = {
                'h': this.objectNameToHashID[objectName],
                'd': []
            };

            if (!Array.isArray(objectArray)) {
                message['d'] = this.objectToData(objectName, object);
            } else {
                for (var object of objectArray) {
                    message['d'].push(this.objectToData(objectName, object));
                }
            }

            return message;
        } else {
            var message = {
                'n': objectName,
                'o': objectArray
            };

            return message;
        }
    }

    //{'a':1, 'b':{'a':1, 'b':2}, 'c':[3,4,5,6], 'd':[{}, {}, {}], 'e': null}
    // 1. object
    // - normal object
    // - array
    // - else (ex. null)

    // 2. no object
    // - string
    // - number
    // - boolean
    // - symbol

    objectToData(objectName, object) {
        var data = [];

        for (var key in object) {
            var valueType = typeof(object[key]);

            if (valueType === 'object') {
                if (Array.isArray(object[key])) {
                    if (typeof(object[key][0]) !== 'object') {
                        data.push(object[key]);
                    } else if (typeof(object[key][0]) === 'object') {
                        data.push(this.newMessage(objectName+'/'+key, object[key]));
                    }
                } else if (!Array.isArray(object[key]) && typeof(object[key] === 'object')) {
                    data.push(this.newMessage(objectName+'/'+key, [object[key]]));
                }
            } else {
                data.push(object[key]);
            }
        }
        return data;
    }
}

module.exports.JFMClient = new JFMClient();

class JFMServer {
    constructor() {
        this.hashIDToFormatStr = {};
    }

    isRegisted(hashID) {
        if (typeof(this.hashIDToFormatStr[hashID]) !== 'undefined') {
            return true;
        }
        return false;
    }

    //{"n": 객체이름, "o": [객체(키+값), 객체(키+값)]}
    //{"h": 해시값, "d": [데이터,데이터]}
    //위 두 케이스만 존재한다고 가정
    parse(data) {
        var result = [];
        var message = {
            'ok': true,
        };
        if (typeof(data['h']) === 'undefined') { // 1. 등록되지 않은 포맷에 대한 요청
            console.log('<JFServer:parse> get registry message');
            message['registry'] = [];
            for (var r of this.registFormat(data['n'], data['o'][0])) {
                message['registry'].push(r);
            }

            for (var o of data['o']) {
                result.push(o);
            }
        } else { // 2. 해시 포맷으로 요청
            if (this.isRegisted(data['h'])) {
                if (data['d'].length > 1) {
                    for (var d of data['d']) {
                        result.push(this.mergeDataWithFormat(data['h'], d, message));
                    }
                } else {
                    result.push(this.mergeDataWithFormat(data['h'], data['d'][0], message));
                }
            } else {
                message['ok'] = false;
                if (typeof(message['err']) === 'undefined') {
                    message['err'] = 'not exist hashID : '+data['h']+'\n';
                } else {
                    message['err'] = message['err']+'not exist hashID : '+data['h']+'\n';
                }
            }
            
        }
        
        return [result, message];
    }

    //(hashID, [1,2,3,4,5])
    //(hashID, [1,2,3,{'h':123, 'd': [data]}])
    //(hashID, [1,2,3,{'h':123, 'd': [data, ..., data]},5,6])
    //(hashID, [1,2,3,[1,2,3,4],5,6])
    //(hashID, [1,2,3,{'h':123, 'd': [data, ..., data]},5,6])
    //(hashID, [1,2,3,null,5,6])
    mergeDataWithFormat(hashID, data, message) {
        var formatString = this.hashIDToFormatStr[hashID];
        return formatString.replace(/{(\d+)}/g, (match, number) => {
            var value = null;
            if (typeof(data[number]) === 'object') {
                if (typeof(data[number]['h']) !== 'undefined') {
                    var temp = this.parse(data[number]);
                    if (temp[1]['ok'] == false) {
                        message['ok'] = false;
                        message['err'] = message['err'] + temp[1]['err'];
                    }
                    if (temp[0].length > 1) {
                        value = '[';
                        for (var s of temp[0]) {
                            value = value + s +',';
                        }
                        value = value.slice(0,-1)+']';
                    } else {
                        value = temp[0];
                    }
                } else if (Array.isArray(data[number])) {
                    value = '[';
                    for (var o of data[number]) {
                        if (typeof(o) === 'string') {
                            value = value + '\"'+o+'\",';
                        } else {
                            value = value + o +',';
                        }
                    }
                    value = value.slice(0,-1)+']';
                } else if (data[number] == 'null') {
                    value = null;
                } else {
                    console.log('<JFServer:mergeDataWithFormat> something wrong...' + data);
                }
            } else {
                if (typeof(data[number]) === 'string') {
                    value = '\"'+data[number]+'\"';
                } else {
                    value = data[number];
                }
            }

            return typeof data[number] != 'undefined'
                ? value
                : match
            ;
        });
    }

    registFormat(objectName, object) {
        var registraionArray = [];
        var objectArray = this.getObjectArray(objectName, object);
        console.log(objectArray);
        
        for (var o of objectArray) {
            var format = this.makeFormatObject(o['o'])
            var data = {
                "n": o['n'],
                "h": this.hashFnv32a(format)
            }
            
            if (typeof(this.hashIDToFormatStr[data['h']]) === "undefined") {
                this.hashIDToFormatStr[data['h']] = format;
                console.log('<JFServer:parseToObject> regist hashID : '+data['h']);
            }
            registraionArray.push(data);
        }
        return registraionArray;
    }

    getObjectArray(objectName, object) {
        var objectArray = [];
        if (typeof(object) === "object") {
            objectArray.push({'n': objectName, 'o':object});
        }

        for (var key in object) {
            if (typeof(object[key]) === "object" && object[key] !== null && !Array.isArray(object[key])) {
                for (var o of this.getObjectArray(objectName+'/'+key, object[key])) {
                    objectArray.push(o);
                }
            } else if (typeof(object[key]) === "object" && object[key] !== null && Array.isArray(object[key])) {
                for (var o of this.getObjectArray(objectName+'/'+key, object[key][0])) {
                    objectArray.push(o);
                }
            }
        }
        return objectArray;
    }

    makeFormatObject(object) {
        //1. 깊은 복사
        var cloneObject = this.cloneObject(object);
    
        //2. 복사된 obj의 모든 값을 null로 만듦
        var nullObject = this.makeNullObject(cloneObject);
    
        //3. nullObject를 string으로 변환
        var str = JSON.stringify(nullObject);
    
        //4. nullString를 format으로 바꿈
        var i = 0;
        var format = str.replace(/:null/g, (match) => {
            return ':{' + i++ +'}';
        });
        return format;
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
        return hval >>> 0;
    }

    cloneObject(object) {
        if (object === null || typeof(object) !== 'object')
            return object;
      
        var copy = object.constructor();
      
        for (var attr in object) {
            if (object.hasOwnProperty(attr)) {
                copy[attr] = this.cloneObject(object[attr]);
            }
        }
      
        return copy;
    }

    makeNullObject(object) {
        for (var key in object) {
            object[key] = null;
        }
        return object;
    }
}

module.exports.JFMServer = new JFMServer()