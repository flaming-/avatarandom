# avatarandom
An avatar randomization server. Allows users to register with a username/password and upload files. When `/a/username.jpg`
is accessed, a file will be randomly chosen based on the weights of the files. (The weights do not have to add up to 100.)

## Usage
Install npm (which comes with node.js) if you haven't already.

Install mongo, start the daemon (on the default port), and run `use avatarandom` from within mongo.

Navigate to the avatarandom directory and run `npm install`.

`sudo nodejs index.js`

Your service is now running on port 80. Use screen or forever if you want to daemonize
 (node.js has no build-in deamon functionality).
