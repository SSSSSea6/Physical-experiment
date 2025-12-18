import crypto from "node:crypto";

function parseArgs(argv) {
  const out = { count: 10, amount: 10, length: 18 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--count") out.count = Number(v);
    if (k === "--amount") out.amount = Number(v);
    if (k === "--length") out.length = Number(v);
  }
  if (!Number.isFinite(out.count) || out.count <= 0) throw new Error("--count invalid");
  if (!Number.isFinite(out.amount) || out.amount <= 0) throw new Error("--amount invalid");
  if (!Number.isFinite(out.length) || out.length < 8 || out.length > 64) throw new Error("--length invalid");
  return out;
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

const { count, amount, length } = parseArgs(process.argv);

for (let i = 0; i < count; i++) {
  const code = randomCode(length);
  process.stdout.write(
    `INSERT INTO redeem_codes(code, amount, status) VALUES ('${code}', ${amount}, 'unused');\n`
  );
}

