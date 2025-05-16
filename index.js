const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cors = require("cors")
const app = express();
const port = 3000;

// Middleware
app.use(cors({
    origin: '*' // Allows all domains
}));
app.use(express.json());

// MongoDB ulanishi
mongoose.connect('mongodb+srv://Ikromov:O2wteU4Tx9ZYLFnT@books.qkcfe.mongodb.net/?retryWrites=true&w=majority&appName=Books', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(data => {
    console.log("CONNECTED MONGODB");

}).catch(err => {
    console.log(err);

});

// Schemas
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    key: String,
    secret: String,
});

const bookSchema = new mongoose.Schema({
    isbn: String,
    title: String,
    author: String,
    published: Number,
    pages: String,
    cover: String,
    status: Number,
});

const User = mongoose.model('User', userSchema);
const Book = mongoose.model('Book', bookSchema);

// Sign generator
function getSign(method, url, body, secret) {
    const rawString = method + url + (body ? JSON.stringify(body) : '') + secret;
    return crypto.createHash('md5').update(rawString).digest('hex');
}

// Auth middleware
async function authenticate(req, res, next) {

    if (req.path === '/signup' || (req.path.startsWith("/books") && req.method === "GET")) {
        return next();
    }
    const userKey = req.header('Key');
    const signHeader = req.header('Sign');

    const user = await User.findOne({ key: userKey });
    if (!user) return res.status(401).json({ isOk: true, message: 'User not found', data: 'unauthorized' });

    const expectedSign = getSign(
        req.method,
        req.path,
        ['POST', 'PATCH'].includes(req.method) ? req.body : null,
        user.secret
    );

    if (signHeader !== expectedSign) {
        return res.status(401).json({ isOk: true, message: 'unable to authorize', data: 'the sign is invalid' });
    }

    req.user = user;
    next();
}

app.use(authenticate);

// Routes

// 1. Signup
app.post('/signup', async (req, res) => {
    const { name, email, key, secret } = req.body;



    const exists = await User.findOne({ name });
    console.log(exists)
    if (exists) return res.status(200).json({ isOk: true, message: 'ok', data: exists });

    const user = new User({ name, email, key, secret });
    await user.save();

    res.json({ isOk: true, message: 'ok', data: user });
});

// 2. Get current user
app.get('/myself', (req, res) => {
    res.json({ isOk: true, message: 'ok', data: req.user });
});

// 3. Get all books
app.get('/books', async (req, res) => {
    const books = await Book.find();
    res.json({ isOk: true, message: 'ok', data: books });
});

// 4. Search books by title
app.get('/books/:title', async (req, res) => {
    const title = req.params.title.toLowerCase();
    const books = await Book.find({ title: { $regex: title, $options: 'i' } });
    res.json({ isOk: true, message: 'ok', data: books });
});

// 5. Add book (simulate OpenLibrary)
app.post('/books', async (req, res) => {
    const { isbn } = req.body;

    if (!isbn) {
        return res.status(400).json({
            isOk: false,
            message: 'ISBN is required',
            data: null
        });
    }

    try {
        // Open Library API-dan kitob ma'lumotlarini olish
        const response = await axios.get(`https://openlibrary.org/isbn/${isbn}.json`);

        const bookData = response.data;

        if (!bookData) {
            return res.status(400).json({
                isOk: false,
                message: 'Book not found',
                data: 'OpenLibrary did not respond properly'
            });
        }

        // Kitob ma'lumotlarini bazaga saqlash
        const newBook = new Book({
            isbn,
            title: bookData.title || 'Unknown Title',
            author: bookData.authors ? bookData.authors.map(author => author.name).join(', ') : 'Unknown Author',
            published: new Date(bookData.publish_date).getTime() || 'Unknown Date',
            pages: bookData.number_of_pages || 'Unknown Pages',
            cover: bookData.cover ? `http://covers.openlibrary.org/b/id/${bookData.cover.large}-L.jpg` : 'No cover available',
            status: 2, // statusni kerakli holatga qo'ying (masalan, 2 - kitob mavjud)
        });

        // Kitobni bazaga saqlash
        await newBook.save();

        return res.json({
            isOk: true,
            message: 'Book saved successfully',
            data: newBook
        });

    } catch (error) {
        console.error('Error fetching book data:', error);
        return res.status(500).json({
            isOk: false,
            message: 'Error fetching book data from OpenLibrary',
            data: error.message
        });
    }
});
// 6. Edit book status
app.patch('/books/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const book = await Book.findById(id);
    if (!book) return res.status(404).json({ isOk: false, message: 'Book not found' });

    book.status = status;
    await book.save();

    res.json({ isOk: true, message: 'ok', data: book });
});

// 7. Delete book
app.delete('/books/:id', async (req, res) => {
    const { id } = req.params;

    const book = await Book.findByIdAndDelete(id);
    if (!book) return res.status(404).json({ isOk: false, message: 'Book not found' });

    res.json({ isOk: true, message: 'ok', data: `Book ${id} deleted` });
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
