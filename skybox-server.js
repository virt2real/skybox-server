#!/usr/bin/nodejs

var DISCOVERY_PORT = 6879;
var DISCOVERY_HOST = '0.0.0.0';
var WS_PORT = 6888;
var REC_DIR = '/var/www/html/records';

var baseIp;
var currentDeviceID;
var currentPlayList;

console.log('Skybox Server v.0.0.1');

var fs = require('fs');

/********************************************************

	UDP discovery

*********************************************************/

var dgram = require('dgram');
var server = dgram.createSocket('udp4');

server.on('listening', function () {
    var address = server.address();
    console.log('UDP Discovery server runned on ' + address.address + ":" + address.port);
});

server.on('message', function (message, remote) {
	parseDiscoveryMessage(message, remote.address, remote.port);
});

server.bind(DISCOVERY_PORT, DISCOVERY_HOST);


function parseDiscoveryMessage(message, host, port) {

	//console.log("discovery message from " + host + ":" + port + ": " + message);

	/// Discovery command looks like this:
	/// {"command":"search","project":"direwolf","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","deviceType":"vr","udpPort":"6881"}

	/// Answer from Skybox on Windows:
	/// {"udp":true,"project":"direwolf server","command":"searchResult","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","computerId":"53709de962eba2f9695c8a926562486c","computerName":"COMP-NAME","ip":"192.168.1.10","ips":["192.168.1.10","169.254.162.78"],"port":6888}


	var json;

	try {
		json = JSON.parse(message);
	} catch (e) {
		console.log('JSON parsing failed');
		return;
	}

	switch (json.command) {

		case "search":

			console.log();
			console.log("Discovery request from device " + json.deviceId + " on " + host + ":" + json.udpPort);

			/// Get local IP's
			var ips = getLocalIps();

			/// Use first IP as base IP
			baseIp = ips[0];

			/// Save device ID
			currentDeviceID = json.deviceId;

			/// Make answer

			var answerJson = {
				"udp":true,
				"project":"direwolf server",
				"command":"searchResult",
				"deviceId": json.deviceId,
				"computerId":"53709de962eba2f9695c8a926562486c",
				"computerName":"STEREO-PI",
				"ip": baseIp,
				"ips": ips,
				"port": WS_PORT
			};

			var answer = JSON.stringify(answerJson);

			/// Send answer

			server.send(answer, 0, answer.length, json.udpPort, host, function(err, bytes) {
			    if (err) throw err;
			    console.log('Discovery answer sent to ' + host +':'+ json.udpPort);
			});

		break;

		default:
			console.log("message from " + host + ":" + port + ": " + message);
	}

}


/********************************************************

	WebSockets commands

*********************************************************/

var io = require('./node_modules/socket.io').listen(WS_PORT); 
console.log("WebSockets server started on " + DISCOVERY_HOST + ":" + WS_PORT);

io.sockets.on('connection', function (socket) {

	console.log();
	console.log('New WebSockets connection ' + socket.id);

	socket.on('disconnect', function() {
		console.log('WebSockets connection closed');
	});

	socket.on('message', function (msg) {
		console.log('New WebSockets message', msg);
	});

	socket.on('clientMessage', function (msg) {
		parseClientMessage(msg, socket);
	});

});


function parseClientMessage(message, socket) {
	var json;

	try {
		json = JSON.parse(message);
	} catch (e) {
		console.log('JSON parsing failed');
		return;
	}

	console.log();
	console.log("New client message: " + json.command);

	switch (json.command) {

		case "addDevice":
			/// Request:
			/// {"command":"addDevice","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","deviceName":"Oculus Pacific","deviceType":"vr","showLoginCode":true}

			socket.sendCustom({"command":"addDeviceResult","success":true,"version":"9","os":"win","isLoggedIn":true});
		break;

		case "getMediaList":
			/// Request:
			/// {"command":"getMediaList"}

			/*socket.sendCustom(
				{
					"command":"getMediaListResult",
					"list":
					[
						{
							"id":"livestream", // 0b373938a29c4d6090980401cd7ce55c
							"name":"StereoPi Live Stream",
							"duration":0,
							"size":0,
							"url":"rtsp://" + baseIp + ":554/h264",
							"thumbnail":"http://" + baseIp + "/thumbnail/livestream.png",
							"thumbnailWidth":186,
							"thumbnailHeight":120,
							"lastModified":1,
							"defaultVRSetting":1,
							"userVRSetting":2,
							"width":1280,
							"height":720,
							"orientDegree":"0",
							"subtitles":[],
							"ratioTypeFor2DScreen":"default",
							"rotationFor2DScreen":0,
							"exists":true,
							"isBadMedia":false,
							"addedTime":1
						},
					]
				}
			);*/

			currentPlayList = getPlayList();

			console.log(currentPlayList);

			if (currentPlayList == undefined) break;

			var list = [];

			for (var i = 0; i < currentPlayList.length; i++) {
				var item = currentPlayList[i];
				list.push(
					{
						"id":item.id,
						"name":item.name,
						"duration":item.duration,
						"size":item.size,
						"url":item.url,
						"thumbnail":item.thumbnail,
						"thumbnailWidth":186,
						"thumbnailHeight":120,
						"lastModified":1,
						"defaultVRSetting":1,
						"userVRSetting":2,
						"width":item.width,
						"height":item.height,
						"orientDegree":"0",
						"subtitles":[],
						"ratioTypeFor2DScreen":"default",
						"rotationFor2DScreen":0,
						"exists":true,
						"isBadMedia":false,
						"addedTime":1
					}
				);
			}

			//console.log(list);

			socket.sendCustom(
				{
					"command":"getMediaListResult",
					"list":list
				}
			);

		break;

		case "getPlayerState":
			/// Request:
			/// {"command":"getPlayerState"}
		break;

		case "getPlaylist":
			/// Request:
			/// {"command":"getPlaylist","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841"}

			if (currentPlayList == undefined) break;

			var list = [];

			for (var i = 0; i < currentPlayList.length; i++) {
				var item = currentPlayList[i];
				list.push(item.id);
			}

			socket.sendCustom(
				{
					"command":"updatePlaylist",
					"list":list
				}
			);
		break;

		case "refreshMediaList":
			/// Request:
			/// {"command":"refreshMediaList"}
		break;

		case "getItemListFromTree":
			/// Request:
			/// {"command":"getItemListFromTree","itemId":"","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","dir":""}
		break;

		case "setPlayerSpeed":
			/// Request:
			/// {"command":"setPlayerSpeed","speed":"1","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841"}

			socket.sendCustom({"command":"updatePlayerSpeed","speed":"1","deviceId":json.deviceId});
		break;

		case "upgradePriority":
			/// Request:
			/// {"command":"upgradePriority","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","ids":["0b373938a29c4d6090980401cd7ce55c"]}
		break;

		case "setPlayerRandomAndLoopMode":
			/// Request:
			/// {"command":"setPlayerRandomAndLoopMode","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","randomMode":"order","loopMode":"playlist"}

			socket.sendCustom({"command":"updatePlayerRandomAndLoopMode","randomMode":"order","loopMode":"playlist","deviceId":json.deviceId});
			socket.sendCustom({"command":"updatePlayerAbLoop","pointA":-1,"pointB":-1,"deviceId":json.deviceId});
		break;

		case "setMirrorScreen":
			/// Request:
			/// {"command":"setMirrorScreen","show":false}
		break;

		case "setVRSetting":
			/// Request:
			/// {"command":"setVRSetting","settingCode":5}
		break;

		case "play":
			/// Request:
			/// {"command":"play","id":"0b373938a29c4d6090980401cd7ce55c","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","playlist":[],"playlistKey":"all","playlistSortBy":"name","playlistSortOrder":"desc"}

			/*socket.sendCustom(
				{
					"deviceId":currentDeviceID,
					"command":"activePlay",
					"actionId":"da06422be98d2fa608731b1296171b8f",
					"id":"0b373938a29c4d6090980401cd7ce55c",
					"exists":true,
					"name":"StereoPi Live Stream",
					"size":48056168,
					"duration":219000,
					"streamType":"RTSP",
					"defaultVRSetting":5,
					"userVRSetting":5,
					"streamUrl":"rtsp://" + baseIp + ":554/h264",
					"playTime":0,
					"width":720,
					"height":480,
					"orientDegree":"0",
					"ratioTypeFor2DScreen":"default",
					"rotationFor2DScreen":0,
					"speed":"1",
					"abLoopPointA":-1,
					"abLoopPointB":-1,
					"randomMode":"order",
					"loopMode":"playlist",
					"randomPlaylist":[],
					"url":"rtsp://" + baseIp + ":554/h264"
				}
			);*/

			console.log('play item ' + json.id);

			if (currentPlayList == undefined) break;

			var foundItem;

			for (var i = 0; i < currentPlayList.length; i++) {
				var item = currentPlayList[i];
				if (item.id == json.id) {
					foundItem = item;
					break;
				}
			}

			if (foundItem == undefined) {
				console.log("item " + json.id + " not found in playlist");
				break;
			}
			

			socket.sendCustom(
				{
					"deviceId":json.deviceId,
					"command":"activePlay",
					"actionId":"da06422be98d2fa608731b1296171b8f",
					"id":foundItem.id,
					"exists":true,
					"name":foundItem.name,
					"size":foundItem.size,
					"duration":foundItem.duration,
					"streamType":"RTSP",
					"defaultVRSetting":5,
					"userVRSetting":5,
					"streamUrl":foundItem.streamUrl,
					"playTime":0,
					"width":foundItem.width,
					"height":foundItem.height,
					"orientDegree":"0",
					"ratioTypeFor2DScreen":"default",
					"rotationFor2DScreen":0,
					"speed":"1",
					"abLoopPointA":-1,
					"abLoopPointB":-1,
					"randomMode":"order",
					"loopMode":"playlist",
					"randomPlaylist":[],
					"url":foundItem.url
				}
			);

			socket.sendCustom({"deviceId":json.deviceId,"command":"activeSetVRSetting","settingCode":5});

		break;

		case "stop":
			/// Request:
			/// {"command":"stop","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841"}
		break;

		case "setTime":
			/// Request:
			/// {"command":"setTime","deviceId":"66a86b57-b292-3957-9fc9-4041d5e1f841","time":3259}
		break;

		case "disconnect":
			/// Request:
			/// {"command":"disconnect"}
		break;

		default:
			console.log("WebSockets unknown client request: " + message);

	}

}


function getPlayList() {
	var playlist = [];

	/// Add live stream item at first
	playlist.push(
		{
			"id":"livestream-rtsp",
			"name":"Live Stream RTSP",
			"duration":0,
			"size":0,
			"url":"rtsp://" + baseIp + ":554/h264",
			"thumbnail":"http://" + baseIp + "/thumbnail/livestream.png",
			"width":1280,
			"height":720,
		}
	);

	/// Add live stream item at first
	playlist.push(
		{
			"id":"livestream-mpegts",
			"name":"Live Stream MPEG-TS",
			"duration":0,
			"size":0,
			"url":"udp://@:3001",
			"thumbnail":"http://" + baseIp + "/thumbnail/livestream.png",
			"width":1280,
			"height":720,
		}
	);

	try {
		var files = fs.readdirSync(REC_DIR);
		for (var i = 0; i < files.length; i++) {
			playlist.push(
				{
					"id": files[i],
					"name": files[i],
					"duration":0,
					"size":0,
					"url":"http://" + baseIp + "/records/" + files[i],
					"thumbnail":"http://" + baseIp + "/thumbnail/file.png",
					"width":1280,
					"height":720,
				}
			);
		}
	} catch (e) {}

	return playlist;
}


/********************************************************

	Utils

*********************************************************/

var os = require('os');

function getLocalIps() {
	var ifaces = os.networkInterfaces();
	var ips = [];

	Object.keys(ifaces).forEach(function (ifname) {
		var alias = 0;
		ifaces[ifname].forEach(function (iface) {
			if ('IPv4' !== iface.family || iface.internal !== false) {
				// skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
				return;
			}

			if (alias >= 1) {
				// this single interface has multiple ipv4 addresses
				//console.log(ifname + ':' + alias, iface.address);
			} else {
				// this interface has only one ipv4 adress
				//console.log(ifname, iface.address);
				ips.push(iface.address);
			}
			++alias;
		});
	});

	return ips;
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}