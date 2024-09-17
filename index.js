const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ["http://localhost:5173", "https://postify-auth.web.app", "https://postify-auth.firebaseapp.com"],
    credentials: true
}))
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ctn12zm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const userCollection = client.db('linknestDB').collection('users')
        const requestCollection = client.db('linknestDB').collection('requests')

        // jwt token API
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            // console.log(user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        const verifyToken = async (req, res, next) => {
            const auth = req.headers.authorization;
            if (!auth) {
                return res.status(401).send({ message: 'not authorized' })
            }

            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ message: 'not authorized' })
                }
                console.log('value token: ', decoded);
                req.decoded = decoded;
                next();
            })
        };

        app.get("/users", verifyToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        app.get("/chk-user/:username", async (req, res) => {
            const username = req.params.username;
            const result = await userCollection.findOne({ username: username });
            res.send(result)
        })

        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const isExist = await userCollection.findOne(query);
            if (isExist) {
                return res.send({ message: 'User Already Exists' })
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
        })

        // get user data through searching by username
        app.get("/user/:username", async (req, res) => {
            const username = req.params.username;
            const result = await userCollection.findOne({ username: username });
            if (result) {
                res.send([result])
                return
            }
            // console.log(result);
            res.send(result)
        })

        app.get("/users/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            const result = await userCollection.findOne({ email });
            res.send(result)
        })

        app.put("/users/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedUser = req.body;
            const updatedUserData = {
                $set: {
                    ...updatedUser
                }
            }
            const result = await userCollection.updateOne(filter, updatedUserData, options);
            res.send(result)
        })

        // Friend Request APIs
        app.post('/request', async (req, res) => {
            const requestData = req.body;
            const result = await requestCollection.insertOne(requestData);
            res.send(result)
        })

        app.get("/request/:username", verifyToken, async (req, res) => {
            const username = req.params.username;
            const result = await requestCollection.find({ receiver_username: username, status: 'Pending' }).toArray();
            res.send(result)
        })

        app.patch("/request-list", async (req, res) => {
            const { rcv_username, send_username } = req.body;
            // console.log(rcv_username, send_username);
            const requester = await userCollection.findOne({ username: send_username });
            const receiver = await userCollection.findOne({ username: rcv_username });
            if (!requester || !receiver) {
                return res.status(404).json({ error: 'Sender or Receiver not found' });
            }
            const result1 = await userCollection.updateOne(
                { _id: new ObjectId(requester._id) }, //query
                { $addToSet: { request_list: receiver.username } } // adding receiver's username to requester's request list
            );
            const result2 = await userCollection.updateOne(
                { _id: new ObjectId(receiver._id) }, //query
                { $addToSet: { request_list: requester.username } } // adding requester's username to receiver's request list
            );
            res.send({ result1, result2 })
            return
        })

        app.patch("/accept-request", verifyToken, async (req, res) => {
            const { req_email, rcv_email } = req.body;

            const requester = await userCollection.findOne({ email: req_email });
            const receiver = await userCollection.findOne({ email: rcv_email });
            if (!requester || !receiver) {
                return res.status(404).json({ error: 'Sender or Receiver not found' });
            }

            const result1 = await userCollection.updateOne(
                { _id: new ObjectId(requester._id) }, //query
                {
                    $addToSet: { friend_list: receiver.username }, // adding receiver's username to requester's friend list
                    $pull: { request_list: receiver.username } // removing receiver's username from requester's request list
                }
            );
            const result2 = await userCollection.updateOne(
                { _id: new ObjectId(receiver._id) }, //query
                {
                    $addToSet: { friend_list: requester.username }, // adding requester's username to receiver's friend list
                    $pull: { request_list: requester.username } // removing requester's username from receiver's request list
                }
            );

            const result3 = await requestCollection.updateOne(
                { requester_email: req_email, receiver_email: rcv_email },
                { $set: { status: 'Accepted' } }
            );
            res.send({ result1, result2, result3 })
        })

        app.patch("/cancel-request", verifyToken, async (req, res) => {
            const { req_email, rcv_email } = req.body;

            const requester = await userCollection.findOne({ email: req_email });
            const receiver = await userCollection.findOne({ email: rcv_email });
            if (!requester || !receiver) {
                return res.status(404).json({ error: 'Sender or Receiver not found' });
            }

            const result1 = await userCollection.updateOne(
                { _id: new ObjectId(requester._id) }, //query
                { $pull: { request_list: receiver.username } } // removing receiver's username from requester's request list

            );
            const result2 = await userCollection.updateOne(
                { _id: new ObjectId(receiver._id) }, //query
                { $pull: { request_list: requester.username } }// removing requester's username from receiver's request list

            );
            const result3 = await requestCollection.updateOne(
                { requester_email: req_email, receiver_email: rcv_email },
                { $set: { status: 'Rejected' } }
            );
            res.send({ result1, result2, result3 })
        })

        app.get("/friend/:id", async (req, res) => {
            const id = req.params.id;
            const user = await userCollection.findOne({ _id: new ObjectId(id) });

            if (!user || !user.friend_list) {
                return res.status(404).json({ error: 'User not found or no friends' });
            }

            const friendsData = await userCollection.find({ username: { $in: user.friend_list } }).toArray();
            res.send(friendsData);
        })

        app.patch("/unfriend", verifyToken, async (req, res) => {
            const { user_username, frnd_username } = req.body;
            const user = await userCollection.findOne({ username: user_username });
            const friend = await userCollection.findOne({ username: frnd_username });
            if (!user || !friend) {
                return res.status(404).json({ error: 'User or Friend not found' });
            }

            const result1 = await userCollection.updateOne(
                { _id: new ObjectId(user._id) }, //query
                { $pull: { friend_list: friend.username } } // removing friend's username from user's friend list

            );
            const result2 = await userCollection.updateOne(
                { _id: new ObjectId(friend._id) }, //query
                { $pull: { friend_list: user.username } }// removing user's username from friend's friend list

            );
            res.send({ result1, result2 })
        })

        app.get("/recommend/:id", async (req, res) => {
            const id = req.params.id;
            const user = await userCollection.findOne({ _id: new ObjectId(id) });

            if (!user || !user.friend_list) {
                return res.status(404).json({ error: 'User not found or no friends' });
            }

            const friendList = user.friend_list;

            // Find users who are friends with the user's friends (excluding the user and current friends)
            const mutualConnections = await userCollection.aggregate([
                {
                    $match: {
                        username: { $nin: [...friendList, user.username] }
                    }
                },
                {
                    $addFields: {
                        mutualCount: {
                            $size: {
                                $setIntersection: [friendList, '$friend_list']
                            }
                        }
                    }
                },
                {
                    // Filter out users who have 0 mutual friends
                    $match: {
                        mutualCount: { $gt: 0 }
                    }
                },
                {
                    $sort: { mutualCount: -1 }
                }
            ]).toArray();
            res.send(mutualConnections)
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('LinkNest Server Running')
})

app.listen(port, () => {
    console.log(`LinkNest Server Running on port ${port}`)
})