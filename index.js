import 'dotenv/config';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';
dns.setServers(['8.8.8.8']);
const app = express();
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(',') }));
app.use(express.json({ limit: '1mb' }));
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.DB_NAME || 'booknook');
const books = db.collection('books');
const borrows = db.collection('borrows');
await borrows.createIndex({ bookId: 1, userEmail: 1, status: 1 });
const authBase = (process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
const jwks = createRemoteJWKSet(new URL(`${authBase}/api/auth/jwks`));
const id = (s) => ObjectId.isValid(s) ? new ObjectId(s) : null;
const error = (res, status, message) => res.status(status).json({ error: message });
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return error(res, 401, 'Please log in');
    const { payload } = await jwtVerify(token, jwks, { issuer: authBase, audience: authBase });
    if (!payload.email) return error(res, 401, 'Email missing from token');
    req.user = { email: payload.email, name: payload.name || '' };
    next();
  } catch (err) {
  console.error('JWT verification failed:', err);
  return error(res, 401, 'Invalid or expired token');
}
}
app.get('/', (_, res) => res.json({ message: 'BookNook API running' }));
app.get('/books', async (req, res) => {
  try {
    const filter = req.query.owner ? { userEmail: String(req.query.owner) } : {};
    const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 100);
    const data = await books.find(filter).sort({ createdAt: -1 }).limit(limit || 0).toArray();
    res.json(data);
  } catch { error(res, 500, 'Could not load books'); }
});
app.get('/books/:id', async (req, res) => {
  try {
    const _id = id(req.params.id);
    if (!_id) return error(res, 400, 'Invalid book ID');
    const book = await books.findOne({ _id });
    return book ? res.json(book) : error(res, 404, 'Book not found');
  } catch { error(res, 500, 'Could not load book'); }
});
app.post('/books', requireAuth, async (req, res) => {
  try {
    const { title, author, category, image, description, totalCopies } = req.body;
    if (![title, author, image, description].every(v => typeof v === 'string' && v.trim()) ||
        !['Fiction','Science','History','Kids','Others'].includes(category) ||
        !Number.isInteger(Number(totalCopies)) || Number(totalCopies) < 0)
      return error(res, 400, 'Please provide valid book details');
    const book = { title: title.trim(), author: author.trim(), category, image, description,
      totalCopies: Number(totalCopies), userName: req.user.name, userEmail: req.user.email, createdAt: new Date() };
    const result = await books.insertOne(book);
    res.status(201).json({ ...book, _id: result.insertedId });
  } catch { error(res, 500, 'Could not add book'); }
});
app.patch('/books/:id', requireAuth, async (req, res) => {
  try {
    const _id = id(req.params.id);


const allowed = ['title','author','category','image','description','totalCopies'];


    
const update = Object.fromEntries(
  Object.entries(req.body).filter(([k, v]) =>
    allowed.includes(k) &&
    (typeof v === 'string' && v.trim() || k === 'totalCopies' && Number.isInteger(v) && v >= 0)
  )
);

    if (update.category && !['Fiction','Science','History','Kids','Others'].includes(update.category))
      return error(res, 400, 'Invalid category');
    if (!Object.keys(update).length) return error(res, 400, 'Nothing to update');
    const result = await books.updateOne({ _id, userEmail: req.user.email }, { $set: update });
    return result.matchedCount ? res.json({ message: 'Book updated' }) : error(res, 404, 'Book not found or not yours');
  } catch { error(res, 500, 'Could not update book'); }
});
app.delete('/books/:id', requireAuth, async (req, res) => {
  try {
    const _id = id(req.params.id);
    if (!_id) return error(res, 400, 'Invalid ID');
    const active = await borrows.countDocuments({ bookId: String(_id), status: 'borrowed' });
    if (active) return error(res, 409, 'Cannot delete a book with active borrows');
    const result = await books.deleteOne({ _id, userEmail: req.user.email });
    return result.deletedCount ? res.json({ message: 'Book deleted' }) : error(res, 404, 'Book not found or not yours');
  } catch { error(res, 500, 'Could not delete book'); }
});
app.post('/borrows', requireAuth, async (req, res) => {
  const _id = id(req.body.bookId);
  if (!_id) return error(res, 400, 'Invalid book ID');
  try {
    const exists = await borrows.findOne({ bookId: String(_id), userEmail: req.user.email, status: 'borrowed' });
    if (exists) return error(res, 409, 'You already borrowed this book');
    const result = await books.findOneAndUpdate({ _id, totalCopies: { $gt: 0 } },
      { $inc: { totalCopies: -1 } }, { returnDocument: 'before' });
    if (!result) return error(res, 409, 'Book not available');
    const borrowDate = new Date();
    const returnDate = new Date(borrowDate.getTime() + 7 * 86400000);
    try {
      const record = { bookId: String(_id), bookTitle: result.title, bookImage: result.image,
        userEmail: req.user.email, borrowDate, returnDate, status: 'borrowed' };
      const inserted = await borrows.insertOne(record);
      res.status(201).json({ ...record, _id: inserted.insertedId });
    } catch (e) {
      await books.updateOne({ _id }, { $inc: { totalCopies: 1 } });
      throw e;
    }
  } catch { error(res, 500, 'Could not borrow book'); }
});
app.get('/borrows', requireAuth, async (req, res) => {
  try { res.json(await borrows.find({ userEmail: req.user.email, status: 'borrowed' }).sort({ borrowDate: -1 }).toArray()); }
  catch { error(res, 500, 'Could not load borrows'); }
});
app.delete('/borrows/:id', requireAuth, async (req, res) => {
  try {
    const _id = id(req.params.id);
    if (!_id) return error(res, 400, 'Invalid borrow ID');
    const result = await borrows.findOneAndUpdate({ _id, userEmail: req.user.email, status: 'borrowed' },
      { $set: { status: 'returned', returnedAt: new Date() } }, { returnDocument: 'before' });
    if (!result) return error(res, 404, 'Active borrow not found');
    await books.updateOne({ _id: new ObjectId(result.bookId) }, { $inc: { totalCopies: 1 } });
    res.json({ message: 'Book returned' });
  } catch { error(res, 500, 'Could not return book'); }
});
app.listen(process.env.PORT || 5000, () => console.log('BookNook server running'));
