# Spot Backend - Guía de Inicio Rápido

API REST construida con **Node.js, Express y TypeScript** para el backend de **Spot**. Gestiona persistencia geográfica de parkings con **PostGIS**, procesamiento de cobros divididos con **Stripe Connect** y avisos automáticos de expiración con **Firebase Cloud Messaging (FCM)**.

---

## 🛠️ Stack y Requisitos

- **Entorno**: Node.js (v18+)
- **Base de Datos**: PostgreSQL (v14+) + **PostGIS** habilitado
- **Pasarela de Pago**: Stripe Connect (Cuentas Express)
- **Notificaciones**: Firebase Admin SDK (Cloud Messaging)

---

## 🚀 Pasos de Instalación y Arranque

### 1. Clonar e Instalar Dependencias
```bash
pnpm install
```

### 2. Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` como `.env`:
```bash
cp .env.example .env
```
Ajusta las credenciales de conexión de tu PostgreSQL, las claves secretas de Stripe y las rutas del SDK de Firebase.

### 3. Migración y Preparación de PostGIS
Inicia sesión en tu terminal interactiva de PostgreSQL y ejecuta la importación del archivo SQL ubicado en `database/schema.sql` para crear la extensión espacial de PostGIS, estructurar las tablas, activar índices GIST espaciales e inyectar registros de prueba de Bilbao:
```bash
psql -U postgres -d spot_db -f database/schema.sql
```

### 4. Compilar e Iniciar Servidor (Soporte ESM nativo)
Dado que el proyecto utiliza módulos de ES nativos (`"type": "module"` en `package.json`), compila con TypeScript y levanta el servidor mediante:
```bash
pnpm build
pnpm start
```
El servidor compilará los archivos en la carpeta `dist` y arrancará localmente escuchando peticiones en `http://localhost:5000`.

---

## 📍 Listado de Endpoints de la API (Conexión Frontend)

La API expone las siguientes rutas y controladores estructurados de forma modular:

### 1. Autenticación (`/api/auth`)
- **`POST /api/auth/login`**: Valida el correo e inicia sesión, retornando el perfil del usuario (incluyendo el ID de usuario `id`, nombre, rol, avatar, token de sesión y lista de vehículos registrados).
- **`POST /api/auth/register`**: Registra un nuevo usuario con rol dual (retornando `id` de usuario y perfil). Si es conductor y define matrícula, registra automáticamente su primer coche.

### 2. Mi Garaje (`/api/vehicles`)
- **`GET /api/vehicles?userId=usr_aitor`**: Devuelve la lista completa de vehículos del usuario.
- **`POST /api/vehicles`**: Añade un vehículo a la base de datos (marca, modelo, matrícula, tamaño).
- **`DELETE /api/vehicles/:id`**: Elimina un vehículo de "Mi Garaje".

### 3. Plazas de Parking (`/api/spots`)
- **`GET /api/spots?lat=43.2625&lng=-2.9350&radius=1000&maxPrice=2.50&size=coche&types=Cubierta`**: Búsqueda geográfica PostGIS filtrada por precio, tamaño y tags del parking.
- **`GET /api/spots/:id`**: Detalle completo de una plaza, incluyendo valoraciones agregadas y lista histórica de reseñas de usuarios.
- **`POST /api/spots`**: Permite a un propietario publicar una plaza de garaje, mapeando lat/lng a geometría Point.
- **`DELETE /api/spots/:id`**: Retira la plaza del buscador.

### 4. Reservas y Valoraciones (`/api/bookings`)
- **`GET /api/bookings?userId=usr_aitor&role=Conductor`**: Obtiene el historial de reservas de un conductor o propietario.
- **`POST /api/bookings`**: Crea un registro de alquiler en estado 'pending' y lanza la pasarela de pago creando un *Payment Intent* de Stripe Connect.
- **`POST /api/bookings/:id/cancel`**: Cancela una reserva que esté en estado activo.
- **`POST /api/bookings/:id/reviews`**: Añade una reseña de estrellas y comentarios a un alquiler expirado.

### 5. Mensajería Instantánea (`/api/chats`)
- **`GET /api/chats?userId=usr_aitor`**: Obtiene la lista de chats abiertos (mapeados a reservas de garaje activas).
- **`GET /api/chats/:bookingId/messages?userId=usr_aitor`**: Devuelve el feed de mensajes de la conversación.
- **`POST /api/chats/:bookingId/messages`**: Envía un mensaje. Si escribe el conductor, simula una auto-respuesta del propietario en 1.5s y despacha notificaciones push de escritorio vía FCM.

### 6. Ajustes de Usuario (`/api/users`)
- **`PUT /api/users/:id/fcm-token`**: Actualiza el token del navegador para emitir notificaciones push.
- **`PUT /api/users/:id/stripe-connect`**: Vincula la cuenta Express de cobros de Stripe.
- **`GET /api/users/:id`**: Información de perfil general.

### 7. Webhook de Stripe
- **`POST /api/stripe/webhook`**: Escucha el evento `payment_intent.succeeded` enviado por los servidores de Stripe para activar la reserva (`status = 'active'`) en PostgreSQL una vez verificado el pago de la tarjeta.
