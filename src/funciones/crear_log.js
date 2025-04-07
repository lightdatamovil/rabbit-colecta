import { executeQuery } from "../../db.js";
import { logGreen, logRed } from "./logsCustom.js";

export async function crearLog(dbConnection, empresa, usuario, perfil, body, tiempo, resultado, metodo, exito) {
    try {
        const sqlLog = `INSERT INTO logs_v2 (empresa, usuario, perfil, body, tiempo, resultado, metodo, exito) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [empresa, usuario, perfil, JSON.stringify(body), tiempo, JSON.stringify(resultado), metodo, exito];

        await executeQuery(dbConnection, sqlLog, values, true);
        logGreen(`Log creado: ${JSON.stringify(values)}`);
    } catch (error) {
        logRed(`Error en crearLog: ${error.stack}`)
        throw error;
    }
}
