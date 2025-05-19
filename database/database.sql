CREATE DATABASE flight_booking_system;
USE flight_booking_system;

-- Tables Creation
CREATE TABLE airlines (
  airline_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(5) UNIQUE NOT NULL,
  contact VARCHAR(15),
  email VARCHAR(100) CHECK (email LIKE '%_@__%.__%'),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE airports (
  airport_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(5) UNIQUE NOT NULL,
  city VARCHAR(50) NOT NULL,
  country VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE flights (
  flight_id INT PRIMARY KEY AUTO_INCREMENT,
  flight_number VARCHAR(10) UNIQUE NOT NULL,
  departure_airport INT NOT NULL,
  arrival_airport INT NOT NULL,
  departure_time DATETIME NOT NULL,
  arrival_time DATETIME NOT NULL,
  aircraft_type VARCHAR(50),
  total_seats INT NOT NULL,
  available_seats INT NOT NULL,
  airline_id INT NOT NULL,
  status ENUM('Scheduled', 'Departed', 'Arrived', 'Canceled', 'Delayed') DEFAULT 'Scheduled',
  previous_departure DATETIME,
  minimum_duration_hours INT DEFAULT 2,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (departure_airport) REFERENCES airports(airport_id) ON DELETE RESTRICT,
  FOREIGN KEY (arrival_airport) REFERENCES airports(airport_id) ON DELETE RESTRICT,
  FOREIGN KEY (airline_id) REFERENCES airlines(airline_id) ON DELETE RESTRICT
) ENGINE=InnoDB;
ALTER TABLE flights 
DROP COLUMN aircraft_type;

CREATE TABLE pricing (
  pricing_id INT PRIMARY KEY AUTO_INCREMENT,
  flight_id INT NOT NULL,
  class ENUM('Economy', 'Business', 'First') NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  ceil_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE,
  CONSTRAINT chk_prices CHECK (ceil_price >= base_price)
) ENGINE=InnoDB;

CREATE TABLE users (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  role ENUM('user', 'admin') DEFAULT 'user',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE passengers (
  passenger_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(15),
  passport_number VARCHAR(20) UNIQUE,
  date_of_birth DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
ALTER TABLE passengers 
DROP INDEX email, 
DROP INDEX passport_number;


CREATE TABLE seats (
  seat_id INT PRIMARY KEY AUTO_INCREMENT,
  seat_number VARCHAR(10) NOT NULL,
  class ENUM('Economy', 'Business', 'First') DEFAULT 'Economy',
  is_booked BOOLEAN DEFAULT FALSE,
  flight_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE (seat_number, flight_id),
  FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE discounts (
  discount_id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) UNIQUE NOT NULL,
  description VARCHAR(255),
  discount_percent DECIMAL(5,2) NOT NULL,
  max_uses INT DEFAULT NULL,
  valid_from DATETIME NOT NULL,
  valid_until DATETIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_discount_percent CHECK (discount_percent BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE tickets (
  ticket_id INT PRIMARY KEY AUTO_INCREMENT,
  seat_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  status ENUM('Confirmed', 'Cancelled', 'Pending') DEFAULT 'Confirmed',
  passenger_id INT NOT NULL,
  flight_id INT NOT NULL,
  discount_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (seat_id) REFERENCES seats(seat_id),
  FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id),
  FOREIGN KEY (flight_id) REFERENCES flights(flight_id),
  FOREIGN KEY (discount_id) REFERENCES discounts(discount_id)
) ENGINE=InnoDB;

-- Add expires_at column
ALTER TABLE tickets 
MODIFY COLUMN seat_id INT NULL,
ADD CONSTRAINT fk_seat_id FOREIGN KEY (seat_id) REFERENCES seats(seat_id);
ALTER TABLE tickets 
ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

-- Update status enum to include 'Expired'
ALTER TABLE tickets 
MODIFY COLUMN status ENUM('Pending','Confirmed','Cancelled','Refund Requested','Expired') DEFAULT 'Pending';
UPDATE tickets SET status = 'pending' WHERE status = 'Pending';
UPDATE tickets SET status = 'confirmed' WHERE status = 'Confirmed';
UPDATE tickets SET status = 'cancelled' WHERE status = 'Cancelled';

ALTER TABLE tickets 
MODIFY status ENUM(
  'Pending',
  'Confirmed', 
  'Cancelled',
  'Refund Requested'
) NOT NULL DEFAULT 'Pending';
CREATE TABLE payments (
  payment_id INT PRIMARY KEY AUTO_INCREMENT,
  ticket_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('Credit', 'Debit', 'UPI', 'NetBanking', 'Wallet') NOT NULL,
  status ENUM('Pending', 'Success', 'Failed', 'Refunded') NOT NULL DEFAULT 'Pending',
  transaction_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
) ENGINE=InnoDB;

CREATE TABLE refunds (
  refund_id INT PRIMARY KEY AUTO_INCREMENT,
  ticket_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('Approved', 'Pending', 'Rejected') DEFAULT 'Pending',
  request_reason TEXT,
  admin_comment TEXT,
  penalty DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
) ENGINE=InnoDB;
CREATE TABLE reviews (
  review_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  flight_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE,
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;
-- Triggers
DELIMITER //

DROP TRIGGER IF EXISTS validate_departure_insert//
CREATE TRIGGER validate_departure_insert
BEFORE INSERT ON flights
FOR EACH ROW
BEGIN
  IF NEW.departure_time < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 48 HOUR) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Departure time must be at least 48 hours from now';
  END IF;

  IF TIMESTAMPDIFF(HOUR, NEW.departure_time, NEW.arrival_time) < NEW.minimum_duration_hours THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Flight duration must be at least 2 hours';
  END IF;
END//


DROP TRIGGER IF EXISTS auto_update_flight_status//
CREATE TRIGGER auto_update_flight_status
BEFORE UPDATE ON flights
FOR EACH ROW
BEGIN
  IF NEW.status = 'Scheduled' AND NOW() >= NEW.departure_time THEN
    SET NEW.status = 'Departed';
  END IF;

  IF NEW.status = 'Departed' AND NOW() >= NEW.arrival_time THEN
    SET NEW.status = 'Arrived';
  END IF;

  IF OLD.status IN ('Arrived') AND NEW.status != OLD.status THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot modify status of completed/canceled flights';
  END IF;

  IF NEW.status = 'Delayed' AND NEW.departure_time <= OLD.departure_time THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'New departure time must be after previous scheduled time';
  END IF;
END//


DROP TRIGGER IF EXISTS generate_seat_prices//
CREATE TRIGGER generate_seat_prices
BEFORE INSERT ON seats
FOR EACH ROW
BEGIN
  DECLARE base_price DECIMAL(10,2);
  DECLARE ceil_price DECIMAL(10,2);
  DECLARE pricing_count INT;

  SELECT COUNT(*) INTO pricing_count
  FROM pricing
  WHERE flight_id = NEW.flight_id
    AND class = NEW.class;

  IF pricing_count = 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'No pricing found for this flight class combination';
  END IF;

  SELECT base_price, ceil_price INTO base_price, ceil_price
  FROM pricing
  WHERE flight_id = NEW.flight_id
    AND class = NEW.class
  ORDER BY created_at DESC
  LIMIT 1;
  
  SET NEW.price = base_price + RAND() * (ceil_price - base_price);
END//


DROP TRIGGER IF EXISTS decrement_available_seats//
CREATE TRIGGER decrement_available_seats
AFTER INSERT ON tickets
FOR EACH ROW
BEGIN
  UPDATE flights
  SET available_seats = available_seats - 1
  WHERE flight_id = NEW.flight_id;
END//

DELIMITER ;

-- Stored Procedures
DELIMITER //

DROP PROCEDURE IF EXISTS create_seats_for_flight//
CREATE PROCEDURE create_seats_for_flight(
  IN p_flight_id INT,
  IN p_economy_seats INT,
  IN p_business_seats INT,
  IN p_first_class_seats INT
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Error creating seats. Please check the flight ID.';
  END;

  START TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM flights WHERE flight_id = p_flight_id) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Invalid flight ID';
  END IF;

  -- Create economy seats
  SET @i = 1;
  WHILE @i <= p_economy_seats DO
    INSERT INTO seats (seat_number, class, flight_id)
    VALUES (CONCAT('E', @i), 'Economy', p_flight_id);
    SET @i = @i + 1;
  END WHILE;

  -- Create business seats
  SET @i = 1;
  WHILE @i <= p_business_seats DO
    INSERT INTO seats (seat_number, class, flight_id)
    VALUES (CONCAT('B', @i), 'Business', p_flight_id);
    SET @i = @i + 1;
  END WHILE;

  -- Create first class seats
  SET @i = 1;
  WHILE @i <= p_first_class_seats DO
    INSERT INTO seats (seat_number, class, flight_id)
    VALUES (CONCAT('F', @i), 'First', p_flight_id);
    SET @i = @i + 1;
  END WHILE;

  COMMIT;
END//

DELIMITER ;

DELIMITER //

CREATE EVENT update_flight_statuses
ON SCHEDULE EVERY 1 MINUTE
STARTS CURRENT_TIMESTAMP
DO
BEGIN
  -- Update to Departed status
  UPDATE flights
  SET status = 'Departed'
  WHERE status IN ('Scheduled', 'Delayed')
    AND UTC_TIMESTAMP() >= departure_time
    AND UTC_TIMESTAMP() < arrival_time;

  -- Update to Arrived status
  UPDATE flights
  SET status = 'Arrived'
  WHERE status IN ('Scheduled', 'Delayed', 'Departed')
    AND UTC_TIMESTAMP() >= arrival_time;
END//

DELIMITER ;

-- 3. Create supporting triggers
DELIMITER //
drop trigger if exists prevent_completed_flight_changes;
-- Prevent manual modification of completed flights
CREATE TRIGGER prevent_completed_flight_changes
BEFORE UPDATE ON flights
FOR EACH ROW
BEGIN
  IF OLD.status IN ('Arrived', 'Departed') AND NEW.status != OLD.status THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot modify status of completed flights';
  END IF;
END//
-- Perform your updates
-- Then recreate the trigger
-- Automatically set to Delayed if departure time changes
CREATE TRIGGER mark_delayed_on_departure_change
BEFORE UPDATE ON flights
FOR EACH ROW
BEGIN
  IF NEW.departure_time > OLD.departure_time THEN
    SET NEW.status = 'Delayed';
    SET NEW.previous_departure = OLD.departure_time;
  END IF;
END//

DELIMITER ;

-- 4. Enable event scheduler
SET GLOBAL event_scheduler = ON;

DELIMITER //

CREATE EVENT update_flight_statuses
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
  -- Mark flights as Departed
  UPDATE flights 
  SET status = 'Departed'
  WHERE status IN ('Scheduled', 'Delayed')
  AND departure_time <= NOW()
  AND arrival_time > NOW();
  
  -- Mark flights as Arrived
  UPDATE flights 
  SET status = 'Arrived'
  WHERE status IN ('Scheduled', 'Delayed', 'Departed')
  AND arrival_time <= NOW();
END//

DELIMITER ;
-- Views
CREATE OR REPLACE VIEW active_flights AS
SELECT f.*, a.name AS airline_name, 
       dep.name AS departure_airport_name,
       arr.name AS arrival_airport_name
FROM flights f
JOIN airlines a ON f.airline_id = a.airline_id
JOIN airports dep ON f.departure_airport = dep.airport_id
JOIN airports arr ON f.arrival_airport = arr.airport_id
WHERE f.status IN ('Scheduled', 'Delayed')
  AND f.departure_time > NOW()
  AND a.is_active = TRUE
  AND dep.is_active = TRUE
  AND arr.is_active = TRUE;

CREATE OR REPLACE VIEW admin_dashboard AS
SELECT 
  (SELECT COUNT(*) FROM users) AS total_users,
  (SELECT COUNT(*) FROM flights) AS total_flights,
  (SELECT SUM(amount) FROM payments WHERE status = 'Success') AS total_revenue,
  (SELECT COUNT(*) FROM refunds WHERE status = 'Pending') AS pending_refunds,
  (SELECT AVG(rating) FROM reviews) AS average_rating;
DROP TRIGGER IF EXISTS prevent_completed_flight_changes;

-- Indexes
CREATE INDEX idx_passengers_user ON passengers(user_id);
CREATE INDEX idx_tickets_passenger ON tickets(passenger_id);
CREATE INDEX idx_ticket_id ON refunds(ticket_id);
CREATE INDEX idx_flights_status ON flights(status);
CREATE INDEX idx_flights_departure ON flights(departure_time);
CREATE INDEX idx_tickets_flight ON tickets(flight_id);
CREATE INDEX idx_payments_ticket ON payments(ticket_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_discounts_code ON discounts(code);
CREATE INDEX idx_seats_flight ON seats(flight_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
drop trigger mark_delayed_on_departure_change;
show triggers;
show triggers;
-- sql queries
use flight_booking_system;
desc reviews;
desc airports;
desc refunds;
desc discounts;desc users;
desc flights;
desc discounts;
desc tickets;
desc reviews;
desc payments;
desc seats;
SHOW TRIGGERS LIKE 'flights';
select * from users;
select * from airlines;
select * from airports;
select * from discounts;
select * from flights;
select * from passengers;
select * from refunds;
select * from seats;
select * from tickets;
select * from pricing;
select * from reviews;
select * from payments;
select * from seats where flight_id=23;

-- Enable safe updates
SET SQL_SAFE_UPDATES = 0;


delete from users where user_id=12;