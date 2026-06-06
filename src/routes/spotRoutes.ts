import { Router, Request, Response } from "express";
import db from "../config/db.js";

const router = Router();

/**
 * GET /api/spots
 * Búsqueda avanzada de parkings utilizando PostGIS.
 * Filtra por coordenadas, radio, precio, dimensiones de coche y servicios (tags).
 * Devuelve también la nota media de estrellas y cantidad de reseñas calculadas dinámicamente.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { lat, lng, radius, maxPrice, size, types } = req.query;

  // Si no se suministran coordenadas base, centramos por defecto en Bilbao centro
  const searchLat = lat ? parseFloat(lat as string) : 43.2630;
  const searchLng = lng ? parseFloat(lng as string) : -2.9350;
  const radiusInMeters = radius ? parseFloat(radius as string) : 50000; // Radio amplio por defecto

  try {
    let sqlParams: any[] = [searchLng, searchLat, radiusInMeters];
    let paramCounter = 4;
    
    // Consulta SQL base con ST_Distance y cálculo dinámico de valoraciones agregando reviews
    let query = `
      SELECT s.id, s.name, s.zone, s.address, s.price, s.tags, s.start_time, s.end_time, s.days,
             ST_X(s.location::geometry) as lng,
             ST_Y(s.location::geometry) as lat,
             ST_Distance(
               s.location, 
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
             ) AS distance_meters,
             COALESCE(ROUND(AVG(r.rating)::numeric, 1), 5.0) AS rating,
             COUNT(r.id)::int AS reviews
      FROM parking_spots s
      LEFT JOIN bookings b ON b.spot_id = s.id
      LEFT JOIN reviews r ON r.booking_id = b.id
      WHERE ST_DWithin(
        s.location, 
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
        $3
      )
    `;

    // Filtro: Precio máximo
    if (maxPrice) {
      query += ` AND s.price <= $${paramCounter}`;
      sqlParams.push(parseFloat(maxPrice as string));
      paramCounter++;
    }

    // Filtro: Tamaño de vehículo
    // Si es furgoneta, filtramos la plaza Lersundi (id lesrundi) por dimensiones reducidas
    if (size === "furgoneta") {
      query += " AND s.id != 'lesrundi'";
    }

    // Filtro: Características (tags)
    // Compara que el arreglo de tags contenga todos los servicios solicitados (tags @> types::text[])
    if (types) {
      const tagsArray = (types as string).split(",");
      query += ` AND s.tags @> $${paramCounter}::text[]`;
      sqlParams.push(tagsArray);
      paramCounter++;
    }

    // Cierre del agrupamiento SQL
    query += `
      GROUP BY s.id
      ORDER BY distance_meters ASC
    `;

    const { rows } = await db.query(query, sqlParams);
    
    // Mapea para retornar un formato compatible con el frontend de Vue
    const formatted = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      zone: row.zone,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      price: parseFloat(row.price),
      total: parseFloat((row.price * 7).toFixed(2)), // Estimación de prueba
      rating: parseFloat(row.rating),
      reviews: row.reviews,
      tags: row.tags,
      availableToday: true,
      availability: {
        startTime: row.start_time.slice(0, 5),
        endTime: row.end_time.slice(0, 5),
        days: row.days
      }
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Error al buscar plazas:", error);
    res.status(500).json({ error: "Error en la consulta espacial de base de datos." });
  }
});

/**
 * GET /api/spots/:id
 * Devuelve la información detallada de una plaza con su historial de reseñas y valoraciones.
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    // Consulta los datos del parking e ingresos
    const spotQuery = `
      SELECT s.id, s.name, s.zone, s.address, s.price, s.tags, s.start_time, s.end_time, s.days,
             ST_X(s.location::geometry) as lng,
             ST_Y(s.location::geometry) as lat,
             COALESCE(ROUND(AVG(r.rating)::numeric, 1), 5.0) AS rating,
             COUNT(r.id)::int AS reviews
      FROM parking_spots s
      LEFT JOIN bookings b ON b.spot_id = s.id
      LEFT JOIN reviews r ON r.booking_id = b.id
      WHERE s.id = $1
      GROUP BY s.id
    `;
    const { rows: spots } = await db.query(spotQuery, [id]);

    if (spots.length === 0) {
      res.status(404).json({ error: "Plaza de parking no encontrada." });
      return;
    }
    const spot = spots[0];

    // Carga los comentarios escritos de las reseñas asociadas a este parking
    const reviewsQuery = `
      SELECT r.id, r.rating, r.comment, r.created_at, u.name as reviewer_name
      FROM reviews r
      JOIN bookings b ON r.booking_id = b.id
      JOIN users u ON b.driver_id = u.id
      WHERE b.spot_id = $1
      ORDER BY r.created_at DESC
    `;
    const { rows: reviewsList } = await db.query(reviewsQuery, [id]);

    res.json({
      id: spot.id,
      name: spot.name,
      zone: spot.zone,
      address: spot.address,
      lat: spot.lat,
      lng: spot.lng,
      price: parseFloat(spot.price),
      rating: parseFloat(spot.rating),
      reviews: spot.reviews,
      tags: spot.tags,
      availability: {
        startTime: spot.start_time.slice(0, 5),
        endTime: spot.end_time.slice(0, 5),
        days: spot.days
      },
      comments: reviewsList
    });
  } catch (error) {
    console.error("Error al obtener detalles del parking:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * POST /api/spots
 * Permite a los propietarios publicar un parking privado.
 * Recibe lat/lng y los convierte al formato POINT de PostGIS.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { ownerId, name, zone, address, lat, lng, price, tags, startTime, endTime, days } = req.body;

  if (!ownerId || !name || !zone || !address || !lat || !lng || !price || !days) {
    res.status(400).json({ error: "Faltan campos obligatorios en el formulario de publicación." });
    return;
  }

  try {
    const spotId = "sp_" + Math.random().toString(36).substr(2, 9);
    
    // Inserta usando ST_SetSRID y ST_MakePoint para guardar las coordenadas en Point
    const query = `
      INSERT INTO parking_spots (id, owner_id, name, zone, address, location, price, tags, start_time, end_time, days)
      VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, $9, $10, $11, $12)
      RETURNING *, 
                ST_X(location::geometry) as lng, 
                ST_Y(location::geometry) as lat
    `;

    const { rows } = await db.query(query, [
      spotId,
      ownerId,
      name,
      zone,
      address,
      parseFloat(lng),
      parseFloat(lat),
      parseFloat(price),
      tags || [],
      startTime || "09:00",
      endTime || "18:00",
      days
    ]);

    const row = rows[0];
    res.status(201).json({
      id: row.id,
      name: row.name,
      zone: row.zone,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      price: parseFloat(row.price),
      tags: row.tags,
      availability: {
        startTime: row.start_time.slice(0, 5),
        endTime: row.end_time.slice(0, 5),
        days: row.days
      }
    });
  } catch (error) {
    console.error("Error al publicar parking:", error);
    res.status(500).json({ error: "Error al registrar la plaza en base de datos." });
  }
});

/**
 * DELETE /api/spots/:id
 * Retira una plaza del buscador.
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM parking_spots WHERE id = $1 RETURNING *";
    const { rows } = await db.query(query, [id]);

    if (rows.length === 0) {
      res.status(404).json({ error: "Plaza no encontrada." });
      return;
    }

    res.json({ success: true, message: "Plaza de parking retirada con éxito.", spot: rows[0] });
  } catch (error) {
    console.error("Error al retirar parking:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
