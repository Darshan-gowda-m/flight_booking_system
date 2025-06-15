# ✈️ Flight Booking System

A **full-stack air travel management platform** that allows users to search, book, and manage flights while providing administrators with powerful tools to oversee operations, revenue, and infrastructure.

---

## 📌 Overview

This system streamlines the **entire travel journey** — from flight search and dynamic booking to post-flight management and refund processing. Built with modern web technologies and robust backend architecture.

---

## ✨ Features

### 🧑‍💼 Admin Dashboard
- 📊 **Flight Statistics & KPIs**
- 👥 **User Management** – Add, delete, and manage passengers
- 💰 **Revenue Tracking** – Visual dashboards using Chart.js

### 🛫 Airport Management
- ✏️ Add/Edit/Remove airport details
- 📆 View flight schedules per airport

### 🏢 Airline & Flight Management
- 🏷️ Manage airline profiles
- 📅 Flight scheduling & dynamic updates (rescheduling, delays)
- 💵 Real-time dynamic pricing engine

### 🎟️ Booking & Ticketing
- 🔎 Advanced search with filters
- 🧾 E-Ticket generation in PDF
- 💺 Interactive seat selection system

### 💸 Refund Management
- 🔁 Refund workflow with admin approvals
- 🧮 Refund logic based on cancellation policy
- 🧾 Track refund history/status

### ⭐ Review System
- 🌟 Users rate flights and leave feedback

---

## 🛠️ Tech Stack

### 🔧 Backend
- **Node.js**, **Express.js**
- **MySQL** – Relational database
- **Redis** – Session and queue handling

### 🎨 Frontend
- **HTML5**, **CSS3** (Flexbox, Grid, Animations)
- **Vanilla JS (ES6+)**
- **Chart.js** – Data visualizations

---

## 🚀 Installation Guide

### 1. Clone the Repo

```bash
git clone https://github.com/yourusername/flight_booking_system.git
cd flight_booking_system
cd backend
npm init -y

# Install backend dependencies
npm install @redis/client@^1.6.0 bcrypt@^5.1.1 bcryptjs@^3.0.2 body-parser@^1.20.3 \
bwip-js@^4.5.3 connect-flash@^0.1.1 cors@^2.8.5 csv-writer@^1.6.0 \
dotenv@^16.4.7 ejs@^3.1.10 exceljs@^4.4.0 express@^4.21.2 \
express-session@^1.18.1 express-validator@^7.2.1 helmet@^8.1.0 joi@^17.13.3 \
jsonwebtoken@^9.0.2 moment@^2.30.1 morgan@^1.10.0 mysql2@^3.14.0 \
node-cron@^3.0.3 node-schedule@^2.1.1 pdfkit@^0.16.0 redis@^4.7.0 \
uuid@^11.1.0 validator@^13.12.0 winston@^3.17.0 \
eslint@^9.23.0 jest@^29.7.0 nodemon@^3.1.10 prettier@^3.5.3 supertest@^7.1.0





Create a .env file inside /backend/:
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=flight_system
PORT=3000
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret
REDIS_HOST=127.0.0.1
REDIS_PORT=6379



cd ../frontend
npm init -y

# Install client dependencies
npm install axios dotenv prettier


 MySQL Setup
Open MySQL Workbench

Execute the contents of database.sql (included in the repo) to set up the required schema and seed data.






Running the Project

cd backend
nodemon server.js


