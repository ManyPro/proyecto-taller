// Backend/src/middlewares/auth.js
import jwt from "jsonwebtoken";

export const authCompany = (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token requerido" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload?.companyId) {
      return res.status(401).json({ error: "Token inválido" });
    }
    req.companyId = payload.companyId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "No autorizado" });
  }
};

// (Opcional) si más adelante quieres auth de usuario:
export const authUser = (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token requerido" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload?.userId) {
      return res.status(401).json({ error: "Token inválido" });
    }
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "No autorizado" });
  }
};
