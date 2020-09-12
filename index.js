const Client = require('node-rest-client').Client;

//TODO
//1. hash를 통해 object format을 가져올 수 있어야 함
//2. hash는 객체 이름을 가짐

class JFMClient {
    constructor() {
        this.objectNameToHashID = {};
        this.client = new Client();
        this.seperator = ';';
    }

    send(url, objectName, object) {
        var client = this.client;
        var receiveMessage = (objectName, data) => {return this.receiveMessage(objectName, data)}

        var message = this.newMessage(objectName, object);
        var args = {
            data: JSON.stringify(message),
            headers: { "Content-Type": "application/json"}
        }
        
        var req = client.post(url, args, function (data, response) {
            var isRegisted = receiveMessage(data);
            if (isRegisted == false) {
                console.log("<JFClient:send> Not exist hashID. Try to regist format");
                args['data'] = JSON.stringify(object);

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

    newMessage(objectName, object) {
        if (this.isRegisted(objectName)) {
            var message = [];
            if (Array.isArray(object)) {
                for (var o of object) {
                    message.push(this.objectToData(objectName, o));
                }
            } else {
                message.push(this.objectToData(objectName, object));
            }
            return message;
        } else {
            var message = [];
            if (Array.isArray(object)) {
                for (var o of object) {
                    message.push({'n':objectName, 'o':o});
                }
            } else {
                message.push({'n':objectName, 'o':object});
            }

            return message;
        }
    }

    objectToData(objectName, object) {
        var data = {
            'h': this.objectNameToHashID[objectName],
            'd': []
        };

        for (var key in object) {
            if (Array.isArray(object[key])) {
                data['d'].push(this.arrayToData(key, object[key]));
            } else if (typeof(object[key])==='object' && object[key]!==null) {
                for (var inData of this.objectToData(key, object[key])['d']) {
                    data['d'].push(inData);
                }
            } else {
                    data['d'].push(object[key]);
            }
        }
        return data;
    }

    
    arrayToData(objectName, array) {
        var data = [];
        for (var element of array) {
            if (typeof(element)==='object' && element!==null && Array.isArray(element)) {
                data.push(this.arrayToData(element));
            } else if (typeof(element)==='object' && element!==null && !Array.isArray(element)) {
                data.push(this.objectToData(objectName, element));
            } else {
                data.push(element);
                // data.push("\""+element+"\"");
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

    //[{"n": 객체이름, "o": 객체(키+값)},{"n": 객체이름, "o": 객체(키+값)}]
    //[{"h": 해시값, "d": [데이터]},{"h": 해시값, "d": [데이터]}]
    //위 두 케이스만 존재한다고 가정
    parse(data) {
        var result = [];
        var message = {
            'ok': true,
        };

        if (typeof(data[0]['h']) === 'undefined') { // 1. 등록되지 않은 포맷에 대한 요청
            console.log('<JFServer:parse> get registry message');
            message['registry'] = [];
            for (var r of this.registFormat(data[0]['n'], data[0]['o'])) {
                message['registry'].push(r);
            }

            for (var d of data) {
                result.push(d['o']);
            }
        } else { // 2. 등록된 포맷에 대한 요청
            for (var d of data) {
                result.push(JSON.parse(this.parseHashData(d, message)));
            }
        }
        return [result, message];
    }

    //해시값으로 요청
    //{"h": 해시값, "d": [데이터]}
    parseHashData(data, message) {
        var result = null;
        if (this.isRegisted(data['h'])) { //1. hash 값으로 데이터를 담아서 보냈고 등록되어 있음
            result = this.mergeDataWithFormat(data);
        } else { //2. hash 값으로 데이터를 담아서 보냈지만 등록되지 않았음
            message['ok'] = false;
            if (typeof(message['err']) === 'undefined') {
                message['err'] = 'not exist hashID : '+data['h']+'\n';
            } else {
                message['err'] = message['err']+'not exist hashID : '+data['h']+'\n';
            }
        }
        return result;
    }
    

    //{"h": 해시값, "d": [데이터]} => json
    mergeDataWithFormat(data) {
        var formatString = this.hashIDToFormatStr[data['h']];
        var datas = data['d'];
        return formatString.replace(/{(\d+)}/g, (match, number) => {
            var value = null;
            if (Array.isArray(datas[number]) && typeof(datas[number][0]) === 'object') {
                value = '[';
                for (var o of datas[number]) {
                    value = value + this.mergeDataWithFormat(o) + ',';
                }
                value = value.slice(0,-1)+']';
            } else if (Array.isArray(datas[number]) && typeof(datas[number][0]) === 'string') {
                value = '[';
                for (var o of datas[number]) {
                    value = value + '\"'+o+'\",';
                }
                value = value.slice(0,-1)+']';
            } else if (Array.isArray(datas[number]) && typeof(datas[number][0]) === 'number') {
                value = '[';
                for (var o of datas[number]) {
                    value = value +o+',';
                }
                value = value.slice(0,-1)+']';
            } else {
                if (typeof(datas[number]) === 'string') {
                    value = '\"'+datas[number]+'\"';
                } else {
                    value = datas[number];
                }
            }

            return typeof datas[number] != 'undefined'
                ? value
                : match
            ;
        });
    }

    registFormat(objectName, object) {
        var registraionArray = [];
        var objectArray = objectArray = this.getObjectArray(objectName, object);
        
        for (var o of objectArray) {
            var format = this.makeFormatObject(o['o'])
            var data = {
                "n": o['n'],
                "h": this.hashFnv32a(format)
            }
            
            if (typeof(this.hashIDToFormatStr[data['h']]) === "undefined") {
                this.hashIDToFormatStr[data['h']] = format;
                console.log('<JFServer:parseToObject> regist hashID : '+data['h']);
                registraionArray.push(data);
            }
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
                for (var o of this.getObjectArray(key, object[key])) {
                    objectArray.push(o);
                }
            } else if (typeof(object[key]) === "object" && object[key] !== null && Array.isArray(object[key])) {
                for (var o of this.getObjectArray(key, object[key][0])) {
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
            if (typeof(object[key]) === 'object' && object[key] !== null && !Array.isArray(object[key])) {
                var temp = this.makeNullObject(object[key]);
            } else {
                object[key] = null;
            }
        }
        return object;
    }
}

module.exports.JFMServer = new JFMServer()