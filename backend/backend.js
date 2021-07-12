const server = require('http').createServer();
const io = require('socket.io')(server, {cors:true});

// List of rooms, owner's id as key, owner's information and players 
// in the same room as value.
let roomList = {};
let card = ['2', '3', '8', '9', 'K'];
let roomStat = {};
let suspectList = {};
let cardprop = {
	1:{ group: 1, selectnum: 3 },
	2:{ group: 2, selectnum: 3 },
	3:{ group: 3, selectnum: 5 },
	4:{ group: 3, selectnum: 3 },
	5:{ group: 4, selectnum: 5 },
	6:{ group: 4, selectnum: 4 },
};
let readyStat = {};
let poolobj = { 2: 0,3: 0, 8: 0, 9:0, 'K': 0};

// Create a room for game
createRoom = function(data, client) {
	/*
	 * data: { id: socket.id <- the id of socket
	 *	   name: name of user <- String
	 * }
	 */

	// Init owner's information, including id and name
	let owner = {
		ownerid: data.id,
		ownername: data.name,
	};

	// Use owner's id as room's id
	client.join(data.id);
	roomList[data.id] = { owner: owner, player:[ data.name ]};

	// Send message to all other socket, to prove the existence of this room
	client.broadcast.emit("listingRoom", roomList[data.id]);
}


// count property num of obj
let objLength = function(obj) {
	let num = 0;
	for(let x in obj) {
		num++;
	}
	return num;
}

// create a card pool for a game room
createPool = function(room, client) {
	let info = roomList[room];// Get information of room
	let players = roomList[room].player;
	let playerNum = players.length;
	let pool = poolobj;
	let stat = {};

	// Init card pool
	for(let key in pool) {
		pool[key] = cardprop[playerNum].group;
	} 

	// Init players' card struct
	readyStat[room] = {};
	for(let key in players) {
		let player = players[key];
		stat[player] = {
			health: 2,
			card: {2: 0, 3: 0, 8: 0, 9: 0, 'K': 0},
			resource: 0
		};
		readyStat[room][player] = false;
	}

	// Select cards for players
	for(let key in players) {
		let player = players[key];
		for(let loop = 0; loop < 2; loop++) {
			cardId = card[Math.floor(Math.random() * 5)];
			if(pool[cardId] > 0) {
				pool[cardId]--;
				stat[player].card[cardId]++;
			}
			else{
				loop--;
			}
		}
	}
	roomList[room] = undefined;
	// send a message to destroy button for this room
	client.broadcast.emit("disableRoom", room); 
	thisRoom = {stat: stat, pool: pool, now: ""};
	roomStat[room] = thisRoom;// confirm stat of room and return
}


// Players join an existing room
joinRoom = function(data, client) {
	/*
	 * data:{ user: name of user <- String
	 * 	  roomid: id for owner of the room <- String
	 * }
	 */

	// data:{user, roomid}
	if(roomList[data.roomid] === undefined) {
		client.emit("refresh");
		return ;
	}
	client.join(data.roomid);
	roomList[data.roomid].player.push(data.user);
	io.to(data.roomid).emit("playersWaiting", roomList[data.roomid].player);
}


// Owner of room begin a game
startGame = function(data, client) {
	let ownerName = data.user;
	let room = data.roomid;
	createPool(room, client);
	io.to(room).emit("initGame", roomStat[room]);
}


// receive signal from all client, when finished, start turn of game
readyToStart = function(data, client) {
	let room = data.room;
	let player = data.user;
	readyStat[room][player] = true;
	let checked = true;

	// watch all players, check if all ready
	for(let i in readyStat[room]) {
		if(readyStat[room][i] == false) {
			checked = false;
			break;
		}
	}
	if(checked) {
		io.to(room).emit("turnStart");// begin turn and loop, until game finished
		let curPlayer;
		for(let user in roomStat[room].stat) {
			curPlayer = user;
			break;
		}
	}
}


drawCard = function(data) {
	let room = data.room;
	let player = data.player;
	let resource = data.resource;
	io.to(room).emit("receiveCard", {room: room, player: player});
	roomStat[room].stat[player].resource += resource;
	io.to(room).emit("freshStat", roomStat[room].stat);
	nextPlayer(room, player);
}


aliveList = function(room, client) {
	let stat = roomStat[room].stat;
	let aliveInfo = {};
	for(let key in stat) {
		let player = stat[key];
		if(player.health > 0) {
			aliveInfo[key] = player.health;
		}
	} 
	// io.to(room).emit("receiveTarget", aliveInfo);
	client.emit("receiveTarget", aliveInfo);
}


// target a player to kill
killPlayer = function(data) {
	let room = data.room;
	let killer = data.killer;
	let killee= data.killee;
	let consume = data.consume;
	roomStat[room].stat[killer].resource -= consume;
	roomStat[room].stat[killee].health--;
	io.to(room).emit("loseHealth", killee);
	if(roomStat[room].stat[killee].health === 0) {
		io.to(room).emit("playerDie", killee);
		io.to(room).emit("freshStat", roomStat[room].stat);
		delete roomStat[room].stat[killee];
	}
	io.to(room).emit("freshStat", roomStat[room].stat);
}

// lose card after attacked
loseCard = function(data, client) {
	let room = data.room;
	let card = data.card;
	let player = data.player;
	roomStat[room].stat[player].card[card]--;
	io.to(room).emit("freshStat", roomStat[room].stat);
}


// receive declaration of hero
receiveHero = function(data, client) {
	io.to(data.room).emit("waitSuspect", data);
	suspectList[data.room] = [];
}


// get power after other's suspect or without suspect
getPower = function(room, player, hero, badGuy, restRob) {
	suspectList[room] = [];// clear suspect list of this room
	if(hero === '2') {
		io.to(room).emit("canRobResource", player);
	}
	else if(hero === '3') {
		drawCard({room: room, player: player, resource: 3});
	}
	else if(hero === '8') {
		if(roomStat[room].now === "rob") {
			roomStat[room].now = "";
			if(restRob === 0) {
				nextPlayer(room, badGuy);
			}
			io.to(room).emit("freshStat", roomStat[room].stat);
		}
		else {
			io.to(room).emit("loseHealth", {player: player, eight: true});
		}
	}
	else if(hero === '9') {
		io.to(room).emit("canHit", {room: room, player: player});
	}
	else if(hero === 'K') {
		roomStat[room].stat[badGuy].resource -= 3;
		nextPlayer(room, badGuy);
	}
	else {
		console.log(hero);
	}
}

getAliveNum = function(stat) {
	let num = 0;
	for(let i in stat) {
		if(stat[i].health > 0) {
			num++;
		}
	}
	return num;
}

// receive suspection of hero
receiveSuspect = function(data, client) {
	let user = data.user;
	let ans = data.suspect;
	let room = data.room;
	let player = data.player;
	let hero = data.hero;
	let badGuy = data.badGuy;
	let restRob = data.restRob;
	if(ans === false) {
		suspectList[room].push(user);
		if(suspectList[room].length === getAliveNum(roomStat[room].stat)) {
			getPower(room, player, hero, badGuy, restRob);
		}
	}
	else {
		io.to(room).emit("endSuspect");
		if(roomStat[room].stat[player].card[hero] > 0) {// suspect fail, user lose health
			killPlayer({room: room, killer: player, killee: user, consume: 0});
			getPower(room, player, hero, badGuy, restRob);
		}
		else {// suspect succeed, player lose health
			killPlayer({room: room, killer: user, killee: player, consume: 0});
			nextPlayer(room, player);
		}
	}
}


// send hero to pool, and then select new hero
handInHero = function(data, client) {
	let room = data.room;
	let player = data.player;
	let hero = data.hero;
	let looptime = cardprop[objLength(roomStat[room].stat)].selectnum;
	let res = [];
	roomStat[room].stat[player].card[hero]--;
	for(let i = 0; i < looptime; i++) {
		cardId = card[Math.floor(Math.random() * 5)];
		if(roomStat[room]['pool'][cardId] > 0) {
			roomStat[room]['pool'][cardId]--;
			res.push(cardId);
		}
		else{
			i--;
		}
	}
	res.push(hero);
	io.to(room).emit("selectNewHero", {player: player, pool: res});
}


// update hero for hero 8
chooseHero = function(data, client) {
	let room = data.room;
	let player = data.player;
	let newHero = data.newHero;
	let restHero = data.restHero;
	for(let i in newHero) {
		roomStat[room].stat[player].card[newHero[i]]++;
	}
	for(let i in restHero) {
		roomStat[room].pool[restHero[i]]++;
	}
	io.to(room).emit("freshStat", roomStat[room].stat);
}

// raise up rob action
toBeRob = function(data, client) {
	let room = data.room;
	let robber = data.robber;
	let robbee = data.robbee;
	let restRob = data.restRob;
	roomStat[room].now = "rob";
	io.to(room).emit("willBeRob", {robber: robber, robbee: robbee, restRob: restRob});
}


giveUp = function(data, client) {
	let room = data.room;
	let user = data.user;
	let tool = data.tool;
	let badGuy = data.badGuy;
	if(tool === '8') {
		roomStat[room].stat[badGuy].resource++;
		roomStat[room].stat[user].resource--;
	}
	else if(tool === 'K') {
		killPlayer({room: room, killer: badGuy, killee: user, consume: 3});
	}
	else {
		console.log("else");
	}
	nextPlayer(room, badGuy);
}

// power of 9, trying to killPlayer
hitPlayer = function(data, client) {
	io.to(data.room).emit("willBeHit", data);
}


//TODO: current player end this turn, time for next player
nextPlayer = function(room, player) {
	io.to(room).emit("freshStat", roomStat[room].stat);
}

io.on('connection', client => {
	client.on('disconnect', () => {	console.log('disconnect'); });
	client.on('createRoom', data => { createRoom(data, client);});
	client.on('listRoom', () => { client.emit('roomlist', roomList); });
	client.on('joinRoom', data => { joinRoom(data, client); });
	client.on('startGame', data => { startGame(data, client); });
	client.on('readyToStart', data => { readyToStart(data, client); });// TODO: add function to begin turn
	client.on('drawCard', data => { drawCard(data); });
	client.on('killPlayer', data => { killPlayer(data, client); });
	client.on('aliveList', room => { aliveList(room, client); });
	client.on('loseCard', data => { loseCard(data, client); });
	client.on('declareHero', data => { receiveHero(data, client); });
	client.on('suspect', data => { receiveSuspect(data, client); });
	client.on('handInHero', data => { handInHero(data, client); });
	client.on('addCard', data => { roomStat[data.room]['pool'][data.card]++; });
	client.on('chooseHero', data => { chooseHero(data, client); });
	client.on('toBeRob', data => { toBeRob(data, client); });
	client.on('giveUp', data => { giveUp(data, client); });
	client.on('hitPlayer', data => { hitPlayer(data, client); });
});


server.listen(3000);
