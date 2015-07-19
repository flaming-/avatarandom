var express = require('express');
var app = express();
var http = require('http');
// var https = require('https');
var mongoose = require('mongoose');
var fs = require('fs');
var crypto = require('crypto');
var mustacheExpress = require('mustache-express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var multer = require('multer');
var sizeOf = require('image-size');

// var NodeCache = require( "node-cache" );
// var cache = new NodeCache();

var sum = function (list) {
	s = 0;
	for (var i = 0; i < list.length; i++) {
		s += parseInt(list[i],10);
	}
	return s;
};

if (fs.existsSync('.salt')) {
	var shasalt = fs.readFileSync('.salt');
} else {
	var shasalt = crypto.randomBytes(20).toString('hex');
	fs.writeFileSync('.salt', shasalt);
}

var sha256 = function (input) {
	var sha = crypto.createHash('sha256');
	sha.update(input + shasalt);
	return sha.digest('hex');
};

mongoose.connect('mongodb://localhost/avatarandom');
mongoose.connection.on('error', function(error){console.log('error:', error);}); 

var userSchema = mongoose.Schema({
	username:	String,
	passhash:	String,
	session:	String,
	data:		Array	// array of [image, probability] arrays - remember to use markModified
});
var userModel = mongoose.model('User', userSchema);

app.on('error', function(err){console.log('error: ', err);});

app.use("/static", express.static('static'));
app.use("/img", express.static('img'));
app.use(bodyParser.urlencoded({extended:true}));
app.use(cookieParser());
app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', './views');

var getUserFromSession = function (req, res, next) {
	userModel.findOne({session: req.cookies.session}, function(err, user){
		req.user = user;
		next();
	});
};
app.use(getUserFromSession);

app.post('/', function(req, res) {
	var username = req.body.username;
	var passhash = sha256(req.body.password);
	userModel.findOne({username: username}, function(err, user){
		if (user === null) {
			registerUser(username, passhash, res);
		} else {
			if (user.passhash == passhash) {
				newSession(user, res);
			} else {
				sendLogin(res, username, "Username already registered.");
			}
		}
	});
});

app.get('/a/*.jpg', function(req, res) {
	// res.sendFile(__dirname + '/img/d048a0294bd8aec7f28ec1fe2957c2dd.png');
	var username = req.originalUrl.slice(3,-4);
	userModel.findOne({username: username}, function(err, user){
		if (user === null) {
			sendDefaultImage(res);
		} else {
			sendAvatarandom(user.data, res);
		}
	});
});

var forceLogin = function (req, res, next) {
	if (req.user === null) {
		sendLogin(res);  // and don't call next
	} else next();
};
app.use(forceLogin); // everything below this is already logged in

app.use(multer({
	dest:	'./img/',
	limits: { fileSize: 256000, files: 1 },		// 256kB
	onFileUploadComplete:	function (file, req, res) {
		var number = parseInt(req.body.number, 10);
		dim = sizeOf(file.path);
		if (number >= 0 && number <= 9 && dim.height <= 400) {
			var oldfile = req.user.data[number][0];
			if (oldfile) fs.unlink(oldfile, function (err) { if (err) throw err; });
			req.user.data[number] = [file.path,10];
			req.user.markModified('data');
			req.user.save();
		} else {
			fs.unlink(file.path);	// delete if invalid image
		}
		redirectMain(res);
	},
}));


app.get('/', function(req, res) {
	sendLoggedUser(req.user, res);
});

app.post('/changeweight', function(req, res) {
	var user = req.user;
	var number = req.body.number;
	var weight = req.body.weight;
	user.data[number][1] = weight;
	user.markModified('data');
	user.save()
	redirectMain(res);
});

var redirectMain = function (res) {
	res.redirect('/');
};

var sendLogin = function (res, username, message) {
	res.render('index', {login: true, username: username?username:'', message: message?message:''});
};

var registerUser = function (username, passhash, res) {
	var user = new userModel({
		username: username,
		passhash: passhash,
		session: null,
		data: new Array(10)
	});
	user.data = user.data.map(function(d){return ['',10];});
	user.markModified('data');
	newSession(user, res);	// calls user.save
};

var sendLoggedUser = function (user, res) {
	res.cookie('session', user.session);
	d = user.data;
	res.render('index', {
		imagesContainer: true,
		username: user.username,
		imginput: function() {
			output = '';
			for (i=0; i<d.length; i++) {
				output += '<tr><td>';
				if (d[i][0]) {
					output += "<img src='" + d[i][0] + "' width='150px' max-height='400px' />"
				}
				output += "</td><td><form class='inline' action='/changeweight' method='POST'>\
					<input type='hidden' name='number' value='"+i+"' />\
					<input class='form-control' type='text' name='weight' value='" + d[i][1] + "' />\
						<button class='btn btn-lg btn-block' type='submit'>change weight</button></form></td>";
					output += "<td><form enctype='multipart/form-data' action='/upload' method='POST'>\
							<input type='hidden' name='number' value='"+i+"' />\
							<input display='inline' type='file' class='file' name='thefile' />\
							<input display='inline' type='submit' value='Upload file' />\
							</form></td>";
				output += '</tr>';
			}
			return output;
		}
	});
};

var newSession = function (user, res) {
	var session = crypto.randomBytes(20).toString('hex');
	user.session = session;
	user.save();
	sendLoggedUser(user, res);
};

var chooseAvatarandom = function (data) {
	var realdata = [];
	for (var i=0;i<data.length;i++) {if(data[i][0]){realdata.push(data[i])}};
	var data = realdata;
	if (data.length == 0) {return 'default.gif';}
	var probs = data.map(function(d){return d[1]});
	var s = sum(probs);
	var rand = Math.random();
	var rolling = 0;
	for (var i = 0; i < probs.length; i++) {
		rolling += probs[i]/s;
		if (rand <= rolling) {
			return data[i][0];
		}
	}
	return data[-1][0];	// floating points amirite?
};

var sendAvatarandom = function (data, res) {
	img = chooseAvatarandom(data);
	// apparently you dont even need to send content-type with express...?
	// if (img.slice(-4) == '.jpg') {
	// 	res.writeHead(200, {'Content-Type': 'image/jpeg'});
	// } else if (img.slice(-4) == '.png') {
	// 	res.writeHead(200, {'Content-Type': 'image/png'});
	// }
	res.sendFile(__dirname + '/' + img);
};

var sendDefaultImage = function (res) {
	res.sendFile(__dirname + '/default.gif');
};

http.createServer(app).listen(80);

// var httpsoptions = {
// 	key : fs.readFileSync('key.pem'),
// 	cert: fs.readFileSync('cert.pem')
// };
// https.createServer(httpsoptions, app).listen(443);