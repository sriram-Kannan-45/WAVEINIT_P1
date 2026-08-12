const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const secret = "CHANGE_ME_to_a_64_char_random_hex_string_at_least";
const payload = {
  id: 95,
  role: "TRAINER",
  email: "wavene20@gmail.com",
  jti: crypto.randomUUID(),
  fp: "test",
  type: "access"
};
const token = jwt.sign(payload, secret, { expiresIn: "15m" });
console.log(token);
