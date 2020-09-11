const Client = require('node-rest-client').Client;

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
            var isRegisted = receiveMessage(objectName, data);
            if (isRegisted == false) {
                console.log("<JFClient:send> Not exist hashID. Try to regist format");
                args['data'] = JSON.stringify(object);

                client.post(url, args, function (data, response) {
                    isRegisted = receiveMessage(objectName, data);
                })
            }
        });

        req.on('error', function (err) {
            console.log('request error...');
        });
    }

    isRegisted(objectName) {
        if (typeof(this.objectNameToHashID[objectName]) != 'undefined') {
            return true;
        }
        return false;
    }

    newMessage(objectName, object) {
        if (this.isRegisted(objectName)) {
            var data = this.objectToDataArray(object);
            var registedObject = {
                'd': data.join(this.seperator),
                'h': this.objectNameToHashID[objectName]
            };
            return registedObject;
        } else {
            return object;
        }
    }

    receiveMessage(objectName, data) {
        if (typeof(data['h']) != 'undefined') {
            this.objectNameToHashID[objectName] = data['h'];
            console.log('<JFClient:receiveMessage> regist hashID : '+data['h']);
        } 
        
        return data['ok'];
    }

    objectToDataArray(object) {
        var dataArray = [];
        for (var key in object) {
            if (typeof(object[key]) === 'string') {
                dataArray.push('\"'+object[key]+'\"');
            } else if (typeof(object[key]) === 'object' && Array.isArray(object[key])) {
                dataArray.push(JSON.stringify(object[key]));
            } else if (typeof(object[key]) === 'object' && !Array.isArray(object[key])) {
                for (var d of this.objectToDataArray(object[key])) {
                    dataArray.push(d);
                }
            } else {
                dataArray.push(object[key]);
            }
        }
        return dataArray;
        //TODO : object를 넣으면 value만 모아서 리턴
    }
}

module.exports.JFMClient = new JFMClient();

class JFMServer {
    constructor() {
        this.hashIDToFormatStr = {};
    }

    parseToObject(data, message) {
        if (typeof(data['h']) != 'undefined') {
            if (typeof(this.hashIDToFormatStr[data['h']]) != 'undefined') {
                console.log('<JFServer:parseToObject> already exist hashID : '+data['h']);
                var object = JSON.parse(this.mergeDataWithFormat(data));

                message['ok'] = true;
                return object;
            }

            message['ok'] = false;
            return object;
        } else {
            var formatString = JSON.stringify(this.makeFormatObject(data));
            console.log("new format :\n"+formatString);
            var hashID = this.hashFnv32a(JSON.stringify(formatString));
            this.hashIDToFormatStr[hashID] = formatString;
            console.log('<JFServer:parseToObject> regist hashID : '+hashID);

            message['ok'] = true;
            message['h'] = hashID;
            return data;
        }
    }

    mergeDataWithFormat(data) {
        var format = JSON.parse(this.hashIDToFormatStr[data['h']]);
        var formatString = format;
        var datas = data['d'].split(';');

        return formatString.replace(/{(\d+)}/g, (match, number) => {
            return typeof datas[number] != 'undefined'
                ? datas[number]
                : match
            ;
        });
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