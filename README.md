# Flight_booking_system
The Flight Booking System is a comprehensive digital platform that enables travelers to search, book, and manage air travel arrangements. This full-stack solution handles the entire journey from initial search to post-flight experience.

Features

Admin Dashboard
Dashboard Overview: Flight statistics and system metrics

User Management: Manage customers accounts

Revenue Tracking: Visualize earnings through charts and graphs

Airport Management
Add/Edit/Remove airports with details 

View airport statistics and flight schedules



Airline Management
Create and manage airline profiles 

Flight Management
Schedule Management: Create and update flight schedules

Real-time Updates: Modify departure/arrival times dynamically

Pricing Engine: Dynamic pricing 

Booking & Ticketing
Customer Booking: Intuitive flight search and booking interface

E-Ticket Generation: Automatic PDF ticket generation upon booking

Seat Selection: Interactive seat map for passenger preference

Refund Management
Process refund requests with approval workflows

Calculate refund amounts based on cancellation policies

Track refund status and history

Review System
Customer rating and feedback collection


Technologies Used
Backend
Node.js (v18+)

Express (Web framework)

Database
MySQL 

Frontend
HTML5 (Semantic markup)

CSS3 (Flexbox, Grid, Animations)

JavaScript (ES6+ with DOM manipulation)

Chart.js (Data visualization)



Installation

git clone https://github.com/yourusername/flight_booking_system.git
cd flight_booking_system


# Install server dependencies
cd backend
npm init -y
npm install @redis/client@^1.6.0 bcrypt@^5.1.1 bcryptjs@^3.0.2 body-parser@^1.20.3 bwip-js@^4.5.3 connect-flash@^0.1.1 cors@^2.8.5 csv-writer@^1.6.0 dotenv@^16.4.7 ejs@^3.1.10 exceljs@^4.4.0 express@^4.21.2 express-session@^1.18.1 express-validator@^7.2.1 helmet@^8.1.0 joi@^17.13.3 jsonwebtoken@^9.0.2 moment@^2.30.1 morgan@^1.10.0 mysql2@^3.14.0 node-cron@^3.0.3 node-schedule@^2.1.1 pdfkit@^0.16.0 redis@^4.7.0 uuid@^11.1.0 validator@^13.12.0 winston@^3.17.0 eslint@^9.23.0 jest@^29.7.0 nodemon@^3.1.10 prettier@^3.5.3 supertest@^7.1.0


.env File(create it)
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
PORT=
JWT_SECRET=
SESSION_SECRET=
REDIS_HOST=
REDIS_PORT=

# Install client dependencies
cd frontend
npm init -y
npm install axios dotenv prettier







MYSQL SETUP
go to mysql qorkbench and exceute all commands in database.sql file 




to execute 
nodemon server.js

