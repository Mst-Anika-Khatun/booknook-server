# BookNook Express API
Express + MongoDB backend with JWT validation against BetterAuth JWKS.
Routes: GET /books, GET /books/:id, POST /books, PATCH /books/:id, DELETE /books/:id, POST /borrows, GET /borrows, DELETE /borrows/:id.
Copy `.env.example` to `.env`, fill in values, run `npm install && npm run dev`.
## Live API
https://booknook-server-dvp2.onrender.com

## Technologies
- Node.js
- Express.js
- MongoDB
- JWT Authentication

## Main Features
- Book management API
- Borrow and return books
- Protected routes
- Book availability tracking
- User-specific book management
## API Overview
The backend provides REST API endpoints for library management.

## Book Endpoints
The API supports creating, reading, updating, and deleting books.

## Borrow Endpoints
The API supports borrowing and returning available books.

## Authentication
Protected API requests require a valid JWT.

## Deployment
The backend API is hosted on Render.

## API Hosting
Production API: https://booknook-server-dvp2.onrender.com
