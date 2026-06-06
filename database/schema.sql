-- ==========================================
-- SCRIPT DE BASE DE DATOS: Spot (PostgreSQL + PostGIS)
-- DESCRIPCIÓN: Creación de tablas, restricciones, índices espaciales
-- y carga inicial de datos de prueba para Bilbao, España.
-- ==========================================

-- 1. Habilitar la extensión espacial PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Limpieza de tablas previas (para entornos de desarrollo)
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS parking_spots CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;

-- 2. Tabla de Usuarios (Soporta rol dual: Conductor y Propietario)
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(20) NOT NULL CHECK (role IN ('Conductor', 'Propietario')),
    stripe_account_id VARCHAR(50), -- Stripe Connect ID de cuenta Express del propietario
    fcm_token VARCHAR(255),        -- Token para notificaciones push en segundo plano
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Vehículos ("Mi Garaje" del conductor)
CREATE TABLE vehicles (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    plate VARCHAR(20) UNIQUE NOT NULL,
    size VARCHAR(20) NOT NULL CHECK (size IN ('moto', 'coche', 'furgoneta')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Plazas de Parking (Con coordenadas geográficas PostGIS)
CREATE TABLE parking_spots (
    id VARCHAR(50) PRIMARY KEY,
    owner_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    zone VARCHAR(50) NOT NULL, -- Ej. Abando, Indautxu, Deusto
    address VARCHAR(255) NOT NULL,
    
    -- Columna geométrica espacial: Puntos geográficos en 2D (latitud y longitud)
    -- SRID 4326 representa el sistema geodésico estándar WGS84 (usado por GPS)
    location GEOMETRY(Point, 4326) NOT NULL,
    
    price NUMERIC(5, 2) NOT NULL CHECK (price >= 0.50),
    tags TEXT[] DEFAULT '{}',     -- Colección de servicios: Cubierta, Vigilancia, etc.
    start_time TIME NOT NULL,      -- Horario disponibilidad inicial propietario
    end_time TIME NOT NULL,        -- Horario disponibilidad final propietario
    days INTEGER[] NOT NULL,       -- Días de la semana permitidos: [1, 2, 3, 4, 5]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Índice Espacial GIST (Crítico para que las búsquedas por radio PostGIS sean de alto rendimiento)
CREATE INDEX idx_parking_spots_location ON parking_spots USING GIST (location);

-- 6. Tabla de Reservas (Pagadas mediante Stripe Connect)
CREATE TABLE bookings (
    id VARCHAR(50) PRIMARY KEY,
    driver_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    spot_id VARCHAR(50) NOT NULL REFERENCES parking_spots(id) ON DELETE RESTRICT,
    vehicle_id VARCHAR(50) REFERENCES vehicles(id) ON DELETE SET NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    subtotal NUMERIC(7, 2) NOT NULL,
    commission NUMERIC(5, 2) NOT NULL,
    total NUMERIC(7, 2) NOT NULL,
    qr_code VARCHAR(150) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
    stripe_payment_intent_id VARCHAR(100), -- Identificador del cobro de Stripe
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla de Reseñas y Valoraciones
CREATE TABLE reviews (
    id VARCHAR(50) PRIMARY KEY,
    booking_id VARCHAR(50) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla de Mensajes (Chat en Tiempo Real)
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    booking_id VARCHAR(50) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    sender_id VARCHAR(50) NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- CARGA DE DATOS DE PRUEBA (MOCK DATA)
-- ==========================================

-- Usuarios iniciales
INSERT INTO users (id, name, email, phone, role) VALUES
('usr_aitor', 'Aitor González', 'aitor.gonzalez@example.com', '+34 600 000 000', 'Conductor'),
('usr_juan', 'Juan Lersundi', 'juan.lersundi@example.com', '+34 611 111 111', 'Propietario'),
('usr_maria', 'María Iparraguirre', 'maria.iparraguirre@example.com', '+34 622 222 222', 'Propietario');

-- Vehículos de Aitor
INSERT INTO vehicles (id, user_id, brand, model, plate, size) VALUES
('vh_1', 'usr_aitor', 'Audi', 'A3 Sportback', '9481KGB', 'coche'),
('vh_2', 'usr_aitor', 'Yamaha', 'T-Max 560', '2914FML', 'moto');

-- Plazas de Parking (Empleando coordenadas reales de Bilbao y parseando a geometría POINT)
INSERT INTO parking_spots (id, owner_id, name, zone, address, location, price, tags, start_time, end_time, days) VALUES
(
    'lesrundi', 
    'usr_juan', 
    'Parking Lersundi', 
    'Abando', 
    'Lersundi Kalea, 9, 48009 Bilbao, Bizkaia',
    ST_SetSRID(ST_MakePoint(-2.9328, 43.2631), 4326), 
    2.00, 
    '{"Cubierta", "Vigilancia 24/7", "Puerta automática"}',
    '08:00', '20:00', '{1,2,3,4,5}'
),
(
    'iparraguirre', 
    'usr_maria', 
    'Garaje Iparraguirre', 
    'Indautxu', 
    'Iparraguirre Kalea, 32, 48011 Bilbao, Bizkaia',
    ST_SetSRID(ST_MakePoint(-2.9389, 43.2603), 4326), 
    1.80, 
    '{"Cubierta", "Puerta automática"}',
    '09:00', '22:00', '{1,2,3,4,5,6}'
),
(
    'deusto', 
    'usr_juan', 
    'Parking Deusto', 
    'Deusto', 
    'Botika Zaharra Kalea, 1, 48014 Bilbao, Bizkaia',
    ST_SetSRID(ST_MakePoint(-2.9490, 43.2710), 4326), 
    1.50, 
    '{"Descubierta", "Cargador eléctrico"}',
    '00:00', '23:59', '{1,2,3,4,5,6,7}'
);

-- ==========================================
-- EJEMPLO DE CONSULTA ESPACIAL POSTGIS (Para API)
-- Busca parkings a menos de 1000m del centro de Bilbao (-2.9350, 43.2630)
-- ==========================================
-- SELECT name, address, price, 
--        ST_Distance(location, ST_SetSRID(ST_MakePoint(-2.9350, 43.2630), 4326)::geography) AS distancia_metros
-- FROM parking_spots
-- WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(-2.9350, 43.2630), 4326)::geography, 1000)
-- ORDER BY location <-> ST_SetSRID(ST_MakePoint(-2.9350, 43.2630), 4326);
