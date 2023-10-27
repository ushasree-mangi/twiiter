const nodemon = require("nodemon");
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const express = require("express");
const bcrypt = require("bcrypt");
let path = require("path");
let format = require("date-fns/format");

let app = express();
app.use(express.json());
let db = null;
let dbPath = path.join(__dirname, "twitterClone.db");
let initializeDbAndServer = async () => {
  try {
    let { open } = sqlite;
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is running...");
    });
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
};
initializeDbAndServer();
let authenticateToken = (request, response, next) => {
  let jwtToken;
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "usha@123", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;

        next();
      }
    });
  }
};
//checking valid user request -middleware function
let isValidUserRequest = async (request, response, next) => {
  let { tweetId } = request.params;
  let { username } = request.payload;
  let isUserRequestValidQuery = `
     select tweet.user_id  from tweet where tweet.tweet_id=${tweetId}
     AND tweet.user_id IN (select following_user_id from follower where
        follower_user_id =(select user_id from user where username='${username}'))`;
  let isUserRequestValid = await db.get(isUserRequestValidQuery);

  if (isUserRequestValid === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
//REGISTER API 1
app.post("/register/", async (request, response) => {
  let { username, password, name, gender } = request.body;
  let hashedPassword = await bcrypt.hash(password, 12);
  let dbQuery = `
    select * from user where username='${username}'`;
  let user = await db.get(dbQuery);

  if (user === undefined) {
    if (password.length < 6) {
      response.status = 400;
      response.send("Password is too short");
    } else {
      let dbQuery = `
        insert into user(name,username,password,gender) values
        ('${name}','${username}','${hashedPassword}','${gender}');`;
      await db.run(dbQuery);
      response.status = 200;
      response.send("User created successfully");
    }
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

//login API 2
app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  let dbQuery = `
    select * from user where username='${username}'`;
  let user = await db.get(dbQuery);

  if (user === undefined) {
    response.status = 400;
    response.send("Invalid user");
  } else {
    let isValidPassword = await bcrypt.compare(password, user.password);

    let payload = {
      username: user.username,
    };
    if (isValidPassword) {
      let jsonWebToken = jwt.sign(payload, "usha@123");
      response.send({ jsonWebToken });
    } else {
      response.status = 400;
      response.send("Invalid password");
    }
  }
});
//GET TWEETS API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request.payload;
  let getUserQuery = `
     select * from user where username='${username}' `;
  let user = await db.get(getUserQuery);
  console.log(user);
  let userId = user.user_id;
  let dbQuery = `
    select user.username ,T.tweet,T.date_time as dateTime from (select * from follower inner join tweet on follower.following_user_id=tweet.user_id 
     where follower.follower_user_id=${userId}  ) AS T inner join user on T.following_user_id =user.user_id ;`;
  /* let dbQuery = `
    select * from (select * from follower inner join tweet on follower.following_user_id=tweet.user_id 
     where follower.follower_user_id=${userId}  ) AS T inner join user on T.following_user_id =user.user_id ;`;
  */ let result = await db.all(
    dbQuery
  );
  response.send(result);
});
// GET USERS FOLLOWED BY LOGGED USERS API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request.payload;
  let dbQuery = ` 
   select username as name from (select following_user_id from user inner join follower on user.user_id=follower.follower_user_id where user.username='${username}' ) 
   as T inner join user on user.user_id=T.following_user_id;
   `;
  let result = await db.all(dbQuery);
  response.send(result);
});
//get user followers API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request.payload;
  let dbQuery = ` 
   select username as name from (select follower_user_id from user inner join follower on user.user_id=follower.following_user_id where user.username='${username}' ) 
   as T inner join user on user.user_id=T.follower_user_id;
   `;
  let result = await db.all(dbQuery);
  response.send(result);
});
//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  isValidUserRequest,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request.payload;
    let dbQuery = `
       select tweet,count(like_id) as likes, replies,dateTime from (select tweet,tweet.tweet_id,tweet.date_time as dateTime,count(reply_id) as replies from tweet left join reply on tweet.tweet_id=reply.tweet_id
          where tweet.tweet_id=${tweetId}) as T left join like on T.tweet_id=like.tweet_id   `;
    let result = await db.get(dbQuery);
    response.send(result);
  }
);
//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  isValidUserRequest,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request.payload;

    let dbQuery = `
            select user.username from like inner join user on like.user_id=user.user_id where like.tweet_id=
            ${tweetId}`;
    let result = await db.all(dbQuery);
    let likes = [];
    for (let eachUser of result) {
      likes.push(eachUser.username);
    }
    response.send({ likes });
  }
);
//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  isValidUserRequest,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request.payload;

    let dbQuery = `
            select username as name,reply from reply inner join user on reply.user_id=user.user_id where reply.tweet_id=
            ${tweetId}`;
    let result = await db.all(dbQuery);
    let replies = result;
    response.send({ replies });
  }
);
//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request.payload;
  let loggedUserIdQuery = `
  select user_id from user where user.username='${username}'`;
  let loggedUserId = await db.get(loggedUserIdQuery);
  loggedUserId = loggedUserId.user_id;
  let dbQuery = `
       select tweet,count(like_id) as likes,replies,dateTime from  (select tweet.tweet_id,tweet, count(reply) as replies, date_time as dateTime from tweet left join reply on tweet.tweet_id=reply.tweet_id
          where tweet.user_id=${loggedUserId} group by tweet.tweet_id) as T left join like on T.tweet_id=like.tweet_id group by T.tweet_id`; // as T left join like on T.tweet_id=like.tweet_id group by T.tweet_id`;
  let result = await db.all(dbQuery);
  response.send(result);
});
//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request.payload;
  let { tweet } = request.body;
  let { user_id } = request;
  let getUserIdQuery = `select user_id from user where username='${username}'`;
  let loggedUserId = await db.get(getUserIdQuery);

  let formatDate = format(new Date(), "yyyy-MM-dd HH-mm-ss");

  let dbQuery = `
    insert into tweet (tweet,user_id,date_time) values('${tweet}',${loggedUserId.user_id},'${formatDate}')`;
  await db.run(dbQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request.payload;
    let { tweetId } = request.params;
    let getUserIdQuery = `select user_id from user where username='${username}'`;
    let loggedUserId = await db.get(getUserIdQuery);
    let query = `
        select user_id from tweet where tweet_id=${tweetId} `;
    let tweetUserId = await db.get(query);

    if (tweetUserId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      if (tweetUserId.user_id === loggedUserId.user_id) {
        let dbQuery = `
    delete from tweet where tweet_id=${tweetId}`;
        await db.run(dbQuery);
        response.send("Tweet Removed");
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    }
  }
);

module.exports = app;
