const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors')
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

        app.get("/users", async (req, res) => {
            const result = await userCollection.find().toArray();
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

        app.get("/users/:email", async (req, res) => {
            const email = req.params.email;
            const result = await userCollection.findOne({ email });
            res.send(result)
        })

        // Friend Request APIs
        app.post('/request', async (req, res) => {
            const requestData = req.body;
            const result = await requestCollection.insertOne(requestData);
            res.send(result)
        })

        app.get("/request/:username", async (req, res) => {
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
                { $push: { request_list: receiver.username } } // adding receiver's username to requester's request list
            );
            const result2 = await userCollection.updateOne(
                { _id: new ObjectId(receiver._id) }, //query
                { $push: { request_list: requester.username } } // adding requester's username to receiver's request list
            );
            res.send({ result1, result2 })
            return
        })

        app.patch("/accept-request", async (req, res) => {
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

        app.patch("/cancel-request", async (req, res) => {
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