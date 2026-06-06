import { Router, Request, Response } from "express";
import db from "../config/db.js";

const router = Router();

/**
 * POST /api/auth/login
 * Busca al usuario por correo electrónico. Si existe, inicia sesión
 * y devuelve el perfil completo con sus vehículos asociados ("Mi Garaje").
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "El correo electrónico es obligatorio." });
    return;
  }

  try {
    const userQuery = "SELECT * FROM users WHERE email = $1";
    const { rows: users } = await db.query(userQuery, [email.toLowerCase().trim()]);

    if (users.length === 0) {
      res.status(401).json({ error: "Usuario no encontrado. Por favor, regístrate." });
      return;
    }

    const user = users[0];

    // Carga los vehículos del usuario
    const vehiclesQuery = "SELECT * FROM vehicles WHERE user_id = $1";
    const { rows: vehicles } = await db.query(vehiclesQuery, [user.id]);

    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mockTokenHere...",
      vehicles,
      selectedVehicleId: vehicles[0]?.id || null
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * POST /api/auth/register
 * Crea una cuenta de usuario con rol dual.
 * Si se ingresa como Conductor e incluye matrícula, registra automáticamente su primer vehículo.
 */
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { name, email, phone, role, plate } = req.body;

  if (!name || !email || !role) {
    res.status(400).json({ error: "Los campos nombre, email y rol son obligatorios." });
    return;
  }

  try {
    const checkUser = "SELECT id FROM users WHERE email = $1";
    const { rows: existing } = await db.query(checkUser, [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      res.status(409).json({ error: "Ya existe un usuario registrado con este correo electrónico." });
      return;
    }

    const userId = "usr_" + Math.random().toString(36).substr(2, 9);
    
    // Inserta el usuario
    const insertUser = `
      INSERT INTO users (id, name, email, phone, role) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const { rows: insertedUsers } = await db.query(insertUser, [
      userId,
      name,
      email.toLowerCase().trim(),
      phone || null,
      role
    ]);
    const user = insertedUsers[0];

    const vehicles: any[] = [];

    // Si es Conductor e ingresó matrícula, añade su primer coche
    if (role === "Conductor" && plate) {
      const vehicleId = "vh_" + Math.random().toString(36).substr(2, 9);
      const insertVehicle = `
        INSERT INTO vehicles (id, user_id, brand, model, plate, size) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *
      `;
      const { rows: insertedVehicles } = await db.query(insertVehicle, [
        vehicleId,
        userId,
        "Vehículo",
        "Registrado",
        plate.toUpperCase().trim(),
        "coche"
      ]);
      vehicles.push(insertedVehicles[0]);
    }

    res.status(201).json({
      id: user.id,
      name: user.name,
      role: user.role,
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mockTokenHere...",
      vehicles,
      selectedVehicleId: vehicles[0]?.id || null
    });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
