import { executeQuery } from '../../../db.js';
import axios from "axios";

export async function insertarPaquete(dbConnection, companyId, clientId, accountId, dataQr, flex, externo) {
    const lote = Math.random().toString(36).substring(2, 15);
    const fecha_inicio = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const idshipment = dataQr.id;
    const senderid = dataQr.sender_id;
    const fechaunix = Math.floor(Date.now() / 1000);

    const queryInsertEnvios = `
        INSERT INTO envios (did, ml_shipment_id, ml_vendedor_id, didCliente, quien, lote, didCuenta, ml_qr_seguridad, fecha_inicio, flex, exterior, fechaunix)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        const result = await executeQuery(
            dbConnection,
            queryInsertEnvios,
            [0, idshipment, senderid, clientId, 1, lote, accountId, JSON.stringify(dataQr), fecha_inicio, flex, externo, fechaunix],
        );

        if (result.insertId) {
            await axios.post(
                'https://altaenvios.lightdata.com.ar/api/enviosMLredis',
                {
                    idEmpresa: companyId,
                    estado: 0,
                    did: result.insertId,
                    ml_shipment_id: idshipment,
                    ml_vendedor_id: senderid
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                },
            );

            const updateSql = `
                UPDATE envios 
                SET did = ? 
                WHERE superado = 0 AND elim = 0 AND id = ? 
                LIMIT 1
            `;


            await executeQuery(dbConnection, updateSql, [result.insertId, result.insertId]);
        }

        return result.insertId;
    } catch (error) {
        console.error('❌ Error en insertarPaquete:', error);
        throw error;
    }
}

