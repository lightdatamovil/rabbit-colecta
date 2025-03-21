import { executeQuery } from '../../db.js';
export async function crearLog(idEmpresa, operador,shipmentId, endpoint, result, quien,conLocal, idDispositivo, modelo, marca, versionAndroid, versionApp) {
   console.log("llegamos a entrar");
   
    try {
        const fechaunix = Date.now();
        const sqlLog = `INSERT INTO logs (didempresa,didEnvio, quien, cadete, data, fechaunix,procesado) VALUES (?,?, ?, ?, ?, ?, ?)`;

        const values = [idEmpresa,shipmentId, quien, operador, JSON.stringify(result), fechaunix,endpoint];
        console.log("llegamos a entrar2");
console.log(values);

    const results=  await executeQuery(conLocal,sqlLog, values);
    console.log(results,"result");
    
    } catch (error) {
        console.error("Error al crear log:", error);
        throw error;
    }
}
