const server = require('http').createServer();
const io = require('socket.io')(server, {cors:true});

// List of rooms, owner's id as key, owner's information and players 
// in the same room as value.
let roomList = {};

// Create a room for game
createRoom = function(data, client) {

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
	console.log(roomList);
}

// Players join an existing room
joinRoom = function(data, client) {

	// data:{user, roomid}
	client.join(data.roomid);
	roomList[data.roomid].player.push(data.user);
	client.broadcast.to(data.roomid).emit('playersWating', roomList[data.roomid].player);
	client.emit('playersWating', roomList[data.roomid].player);
}

io.on('connection', client => {
	client.on('disconnect', () => {	console.log('disconnect'); });
	client.on('createRoom', data => { createRoom(data, client);});
	client.on('listRoom', () => { client.emit('roomlist', roomList); });
	client.on('joinRoom', data => { joinRoom(data, client); });
});


server.listen(3000);
