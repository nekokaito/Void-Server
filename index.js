const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 4000;
const jwt = require("jsonwebtoken");

// >> MIDDLEWARE

app.use(
  cors({
    origin: "http://localhost:5173",
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

// Token verification
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.send({ message: "No Token" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_KEY_TOKEN, (err, decoded) => {
    if (err) {
      return res.send({ message: "Invalid Token" });
    }
    req.decoded = decoded;
    next();
  });
};

// verify seller

const verifySeller = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };

  try {
    const user = await userCollection.findOne(query);

    if (user?.role !== "seller" && user?.role !== "admin") {
      return res.status(403).send({ message: "Forbidden Access" });
    }

    next();
  } catch (error) {
    console.error("Error verifying seller:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

//MongoDB Information

const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vrlyepl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(url, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const userCollection = client.db("void_tech").collection("users");
const productCollection = client.db("void_tech").collection("products");
const messageCollection = client.db("void_tech").collection("messages");

const dbConnect = async () => {
  try {
    client.connect();
    console.log("DB Connected");

    //get user
    app.get("/user/:email", async (req, res) => {
      const query = { email: req.params.email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    // get all user

    app.get("/users", async (req, res) => {
      try {
        const users = await userCollection.find({}).toArray();
        res.status(200).json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // update user

    app.patch("/users/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      try {
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Role updated successfully" });
        } else {
          res.send({ success: false, message: "Failed to update role" });
        }
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Internal Server Error" });
      }
    });

    //delete user

    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await userCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.send({ success: true, message: "User removed successfully" });
        } else {
          res.send({ success: false, message: "Failed to remove user" });
        }
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Internal Server Error" });
      }
    });

    //insert user

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      //checking if user already exist or not

      if (existingUser) {
        return res.send({ message: "User Already Exists" });
      }
      //inserting user in User collection
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
  } catch (error) {
    console.log(error.name, error.message);
  }

  // post message

  app.post("/add-products", async (req, res) => {
    const message = req.body;
    const result = await messageCollection.insertOne(message);
    res.send(result);
  });

  // get message

  app.get("/messages", async (req, res) => {
    const messages = await messageCollection.find({}).toArray();
    res.status(200).json(messages);
  });

  //add product

  app.post("/add-products", verifyJWT, verifySeller, async (req, res) => {
    const product = req.body;
    const result = await productCollection.insertOne(product);
    res.send(result);
  });

  //get all feature product

  app.get("/products", async (req, res) => {
    try {
      const products = await productCollection.find({}).limit(6).toArray();
      res.status(200).json(products);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // get user product

  app.get(
    "/all-products/:params",
    verifyJWT,
    verifySeller,
    async (req, res) => {
      const emailReg = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/g;
      const params = req.params.params;

      let finalResult;
      if (emailReg.test(params)) {
        finalResult = await productCollection
          .find({ sellerEmail: params })
          .toArray();
      } else {
        const query = { _id: new ObjectId(params) };
        finalResult = await productCollection.findOne(query);
      }
      res.send(finalResult);
    }
  );

  // get products
  app.get("/all-products", async (req, res) => {
    // name searching, sort by price, filter by category, filter by brand

    const { title, sort, category, brand } = req.query;

    const query = {};

    title && (query.title = { $regex: title, $options: "i" });

    category && (query.category = category);

    brand && (query.brand = brand);

    const sortOption = sort === "asc" ? 1 : -1;

    const product = await productCollection
      .find(query)
      .sort({ price: sortOption })
      .toArray();

    const totalProducts = await productCollection.countDocuments(query);

    const productInfo = await productCollection
      .find(
        {},
        {
          projection: { category: 1, brand: 1 },
        }
      )
      .toArray();
    const categories = [
      ...new Set(productInfo.map((product) => product.category)),
    ];
    const brands = [...new Set(productInfo.map((product) => product.brand))];

    const data = { product, brands, categories, totalProducts };

    res.json(data);
  });

  //update whishlist

  app.patch("/wishlist/add", verifyJWT, async (req, res) => {
    const { email, productId } = req.body;

    const result = await userCollection.updateOne(
      { email: email },
      { $addToSet: { wishlist: new ObjectId(String(productId)) } }
    );

    res.send(result);
  });

  app.get("/all-product/:id", async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await productCollection.findOne(query);
    res.send(result);
  });

  // update user data

  app.put("/update-product/:id", verifyJWT, verifySeller, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const options = { upsert: true };
    const itemUpdated = req.body;

    // title, image, brand, stock, price, category, description;

    const item = {
      $set: {
        image: itemUpdated.image,
        title: itemUpdated.title,
        brand: itemUpdated.brand,
        stock: itemUpdated.stock,
        price: itemUpdated.price,
        category: itemUpdated.category,
        description: itemUpdated.description,
      },
    };

    const result = await productCollection.updateOne(filter, item, options);
    res.send(result);
  });
};
dbConnect();

app.get("/", (req, res) => {
  res.send("Server Started");
});

// JWT
app.post("/authentication", async (req, res) => {
  const userEmail = req.body;

  const token = jwt.sign(userEmail, process.env.ACCESS_KEY_TOKEN, {
    expiresIn: "5d",
  });
  res.send({ token });
});

app.listen(port, () => {
  console.log(`${port}PORT`);
});
