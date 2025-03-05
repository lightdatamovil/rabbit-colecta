import { executeQuery } from "../../../db.js";

export async function informePro(dbConnection) {
    const hoy = new Date().toISOString().split('T')[0] + " 00:00:00";

    const sqlColectados = `
        SELECT COUNT(id) as total 
        FROM envios_historial 
        WHERE autofecha > ? AND estado = 1
    `;

    const sqlNuevosColectados = `
        SELECT COUNT(id) as total 
        FROM envios 
        WHERE fecha_inicio > ? AND superado = 0 AND elim = 0
    `;

    try {
        const resultColectados = await executeQuery(dbConnection, sqlColectados, [hoy]);
        const colectados = resultColectados[0]?.total || 0;

        const resultNuevosColectados = await executeQuery(dbConnection, sqlNuevosColectados, [hoy]);
        const nuevosColectados = resultNuevosColectados[0]?.total || 0;

        return {
            colectados: colectados.toString(),
            nuevosColectados: nuevosColectados.toString()
        };
    } catch (error) {
        console.error('❌ Error en informePro:', error);
        throw error;
    }
}