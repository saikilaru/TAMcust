
import WebSocket from 'ws';

export default function sdpService(record) {
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    console.log(record);
    var wsSDP = new WebSocket("ws://50.19.75.1:8686/swap");
    wsSDP.onopen = async function () {
        // Web Socket is connected, send data using send()
        wsSDP.send('{"cmd":"login","tag":"222333","username":"admin","password":"admin"}');
        await sleep(1000);
        
        wsSDP.send('{ "cmd": "addVistors", "tag": "123423424", "data": [{ "userName": "223344", "paperNo": "11122", "paperType": "1", "sex": 1, "company": "1", "masterName": "112233", "reason": "11122", "startTime": "2020-10-07 17:00:00", "endTime": "2020-10-14 17:00:00", "phone": "11122", "photoUrl": "https://www.incimages.com/uploaded_files/image/1920x1080/getty_495142964_198701.jpg", "areaCode": "QY001" } ] }');
        wsSDP.onmessage = function (evt) {
            var received_msg = evt.data;

        };

    };


}
