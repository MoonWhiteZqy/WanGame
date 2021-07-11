const server = require('http').createServer();
const io = require('socket.io')(server, {cors:true});

// List of rooms, owner's id as key, owner's information and players 
// in the same room as value.
let roomList = {};
let card = ['2', '3', '8', '9', 'K'];
let roomStat = {};
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
	// TODO: send a message to destroy button for this room
	client.broadcast.emit("disableRoom", room); 
	thisRoom = {stat: stat, pool: pool};
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
		console.log(roomStat[room]);
		let curPlayer;
		for(let user in roomStat[room].stat) {
			curPlayer = user;
			break;
		}
		turnOnPlayer(client, room, curPlayer);
	}
}

// TODO: function for a turn
turnOnPlayer = function(client, room, curPlayer) {
	io.to(room).emit("state0", {room: room, cur: curPlayer});
}


drawCard = function(data, client) {
	let room = data.room;
	let player = data.player;
	io.to(room).emit("receiveCard", {room: room, player: player});
	roomStat[room].stat[player].resource += 2;
	io.to(room).emit("freshStat", roomStat[room].stat);
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


// TODO: target a player to kill
killPlayer = function(data, client) {
	let room = data.room;
	let killer = data.killer;
	let killee= data.killee;
	roomStat[room].stat[killer].resource -= 7;
	roomStat[room].stat[killee].health--;
	console.log(killer, "has killed", killee);
	io.to(room).emit("loseHealth", killee);
	// TODO: some things after killee die
}

// lose card after attacked
loseCard = function(data, client) {
	let room = data.room;
	let card = data.card;
	let player = data.player;
	roomStat[room].stat[player].card[card]--;
	io.to(room).emit("freshStat", roomStat[room].stat);
}

io.on('connection', client => {
	client.on('disconnect', () => {	console.log('disconnect'); });
	client.on('createRoom', data => { createRoom(data, client);});
	client.on('listRoom', () => { client.emit('roomlist', roomList); });
	client.on('joinRoom', data => { joinRoom(data, client); });
	client.on('startGame', data => { startGame(data, client); });
	client.on('readyToStart', data => { readyToStart(data, client); });// TODO: add function to begin turn
	client.on('drawCard', data => { drawCard(data, client); });
	client.on('killPlayer', data => { killPlayer(data, client); });
	client.on('aliveList', room => { aliveList(room, client); });
	client.on('loseCard', data => { loseCard(data, client); });
});


server.listen(3000);
