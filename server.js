const express = require('express');
const app = express();
const env = require('dotenv').config();
const session = require('express-session');
const db = require('./config/db');
const path = require('path');
const userRouter = require('./routes/userRouter');

db()

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 5 * 60 * 1000}
}));

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.set("view engine", "ejs");
app.set("views", [path.join(__dirname, "views/user"), path.join(__dirname, "views/admin")]);
app.use(express.static(path.join(__dirname, "public")));


app.use('/', userRouter);

app.listen(process.env.PORT, () => console.log(`server running (CareZon)`));
