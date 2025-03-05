import { executeQuery, getProdDbConfig, getCompanyByCode } from "../../../db.js";
import { asignar } from "../functions/asignar.js";
import mysql from 'mysql';

export async function handleFlexLogic(dbConnection, companyId, userId, profile, dataQr, myAccounts, autoAssign) {
    const senderid = dataQr.sender_id;
    const idshipment = dataQr.id;
    let didcliente = -1;
    let didpaquete = -1;
    let estado_envio = -1;
    let paquetecargado = false;

    if (myAccounts[companyId][senderid]) {
        didcliente = myAccounts[senderid].didcliente;
        didcuenta = myAccounts[companyId][senderid].didcuenta;
    }

    const sql = `
        SELECT did, estado_envio, didCliente, didCuenta, ml_qr_seguridad 
        FROM envios 
        WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
        LIMIT 1
    `;

    const result = await executeQuery(dbConnection, sql, [idshipment, senderid]);

    const row = result[0];

    if (row) {
        didpaquete = row.did;
        estado_envio = row.estado_envio * 1;
        didcliente = row.didCliente;
        didcuenta = row.didCuenta;
        paquetecargado = false;
    }

    if (didpaquete !== -1) {
        const sqlColectado = `
            SELECT id, estado 
            FROM envios_historial 
            WHERE didEnvio = ? LIMIT 1
        `;
        const rowsColectado = await executeQuery(dbConnection, sqlColectado, [didpaquete]);

        if (rowsColectado.length > 0 && rowsColectado[0].estado == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        }
    }

    if (didcliente === -1) {
        const sqlExternas = `
            SELECT did, nombre_fantasia, codigoVinculacionLogE 
            FROM clientes 
            WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
        `;

        const rowsExternas = await executeQuery(dbConnection, sqlExternas);

        for (const clienteexterno of rowsExternas) {
            const codigovinculacion = clienteexterno.codigoVinculacionLogE;

            const company = await getCompanyByCode(codigovinculacion);

            const dbConfigExt = getProdDbConfig(company.did);
            const dbConnectionExt = mysql.createConnection(dbConfigExt);
            dbConnectionExt.connect();

            const didclienteLocal_ext = clienteexterno.did;

            const idempresaExterna = dataEmpresaExterna.id;
            const nombre_fantasia = clienteexterno.nombre_fantasia;

            const sqlCuentas = `
                    SELECT did, didCliente 
                    FROM clientes_cuentas 
                    WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
                `;
            const rowsCuentas = await executeQuery(dbConnectionExt, sqlCuentas, [senderid]);

            if (rowsCuentas.length > 0) {
                const didcliente_ext = rowsCuentas[0].didCliente;
                const didcuenta_ext = rowsCuentas[0].did;

                const sqlEnvios = `
                        SELECT did, estado_envio, didCliente, didCuenta 
                        FROM envios 
                        WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
                        LIMIT 1
                    `;

                const rowsEnvios = await executeQuery(dbConnectionExt, sqlEnvios, [idshipment, senderid]);

                let externalShipmentId = -1;
                if (rowsEnvios.length > 0) {
                    externalShipmentId = rowsEnvios[0].did;
                } else {
                    externalShipmentId = await insertarPaquete(didcliente_ext, didcuenta_ext, dataQr, dbConnectionExt, 1, 0, idempresaExterna);
                }

                if (externalShipmentId !== -1) {
                    const didpaquete_local = await insertarPaquete(didclienteLocal_ext, 0, dataQr, dbConnection, 1, 1, companyId);
                    await insertEnviosExteriores(externalShipmentId, didpaquete_local, dbConnection, 1, nombre_fantasia, idempresaExterna);

                    const sqlChofer = `
                            SELECT usuario 
                            FROM sistema_usuarios_accesos 
                            WHERE superado = 0 AND elim = 0 AND codvinculacion = ?
                        `;

                    const rowsChofer = await executeQuery(dbConnectionExt, sqlChofer, ["cogote"]);

                    const didchofer = rowsChofer.length > 0 ? rowsChofer[0].usuario : -1;

                    if (rowsEnvios[0].estado_envio === 0) {
                        return { estadoRespuesta: false, mensaje: "Paquete ya colectado" };
                    }

                    if (didchofer > -1) {
                        if (autoAssign) {
                            const payload = {
                                companyId: dataEmpresaExterna.id,
                                userId: userId,
                                profile: profile,
                                appVersion: "null",
                                brand: "null",
                                model: "null",
                                androidVersion: "null",
                                deviceId: "null",
                                dataQr: {
                                    id: '44429054087',
                                    sender_id: 413658225,
                                    hash_code: 'ZpFyEQnGa+juvrAxbe83sWRg1S+8qZPyOgXGI1ZiqjY=',
                                    security_digit: '0'

                                },
                                driverId: didchofer,
                                deviceFrom: "Autoasignado de colecta"
                            };

                            try {
                                await post('https://asignaciones.lightdata.app/api/asignaciones/asignar', payload);
                            } catch (error) {
                                console.error('Error al hacer la solicitud POST:', error);
                                return { estadoRespuesta: false, mensaje: "Error al asignar paquete al chofer - NOFLEX" };
                            }
                        }

                        fsetestadoConector(didpaquete_local, 0, dbConnectionExt);

                        if (autoAssign) {
                            const payload = {
                                companyId: companyId,
                                userId: userId,
                                profile: profile,
                                appVersion: "null",
                                brand: "null",
                                model: "null",
                                androidVersion: "null",
                                deviceId: "null",
                                dataQr: {
                                    id: '44429054087',
                                    sender_id: 413658225,
                                    hash_code: 'ZpFyEQnGa+juvrAxbe83sWRg1S+8qZPyOgXGI1ZiqjY=',
                                    security_digit: '0'

                                },
                                driverId: userId,
                                deviceFrom: "Autoasignado de colecta"
                            };
                            await asignar(payload)
                        }

                        await fsetestadoConector(dbConnectionExt, externalShipmentId);

                        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };
                    }
                }
            }
        }
    } else if (!paquetecargado) {
        if (estado_envio === 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
        } else {
            if (autoAssign) {
                const payload = {
                    companyId: companyId,
                    userId: userId,
                    profile: profile,
                    appVersion: "null",
                    brand: "null",
                    model: "null",
                    androidVersion: "null",
                    deviceId: "null",
                    dataQr: dataQr,
                    driverId: userId,
                    deviceFrom: "Autoasignado de colecta"
                };

                await asignar(payload)
            }

            await fsetestadoConector(dbConnection, didpaquete);

            return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };

        }
    } else {
        const didpaquete_local = await insertarPaquete(didcliente, 0, dataQr, dbConnection, 1, 0, companyId);

        const queryUpdateEnvios = `
                UPDATE envios 
                SET ml_qr_seguridad = ?
                WHERE superado = 0 AND elim = 0 AND did = ?
                LIMIT 1
            `;

        await executeQuery(dbConnection, queryUpdateEnvios, [dataQr, didpaquete_local]);


        await fsetestadoConector(dbConnection, didpaquete);
        if (autoAssign) {
            const payload = {
                companyId: companyId,
                userId: userId,
                profile: profile,
                appVersion: "null",
                brand: "null",
                model: "null",
                androidVersion: "null",
                deviceId: "null",
                dataQr: dataQr,
                driverId: userId,
                deviceFrom: "Autoasignado de colecta"
            };

            await asignar(payload)
        }

        return { estadoRespuesta: true, mensaje: "Paquete insertado y colectado - FLEX" };


    }

}