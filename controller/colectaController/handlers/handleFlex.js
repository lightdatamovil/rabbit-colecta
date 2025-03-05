import { getCompanyByCode } from "../../../db";
import { executeQuery, getProdDbConfig } from "../../../db";
import { asignar } from "../functions/asignar";
import { fsetestadoConector } from "../functions/ponerRetirado";
import { mysql } from 'mysql';

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
        if (row.ml_qr_seguridad !== '') tengoQR = true;
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
        rowsExternas.forEach(row => Aexternas.push(row));

        let paqueteExternoInsertdo = false;

        for (const clienteexterno of Aexternas) {
            const codigovinculacion = clienteexterno.codigoVinculacionLogE;
            const company = await getCompanyByCode(codigovinculacion);
            const dbConfigExt = getProdDbConfig(company.did);
            const dbConnectionExt = mysql.createConnection(dbConfigExt);
            dbConnectionExt.connect();

            const didclienteLocal_ext = clienteexterno.did;


            const idempresaExterna = dataEmpresaExterna.id;
            const nombre_fantasia = clienteexterno.nombre_fantasia;

            if (dataEmpresaExterna) {
                const connectionE = createDBConnection(dataEmpresaExterna);
                const sqlCuentas = `
                    SELECT did, didCliente 
                    FROM clientes_cuentas 
                    WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
                `;
                const rowsCuentas = await executeQuery(connectionE, sqlCuentas, [senderid]);

                if (rowsCuentas.length > 0) {
                    const didcliente_ext = rowsCuentas[0].didCliente;
                    const didcuenta_ext = rowsCuentas[0].did;

                    const sqlEnvios = `
                        SELECT did, estado_envio, didCliente, didCuenta 
                        FROM envios 
                        WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
                        LIMIT 1
                    `;
                    const rowsEnvios = await executeQuery(connectionE, sqlEnvios, [idshipment, senderid]);

                    let didpaquete_ext = -1;
                    if (rowsEnvios.length > 0) {
                        didpaquete_ext = rowsEnvios[0].did;
                    } else {
                        didpaquete_ext = await insertarPaquete(didcliente_ext, didcuenta_ext, dataQr, connectionE, 1, 0, idempresaExterna);
                    }

                    if (didpaquete_ext !== -1) {
                        const didpaquete_local = await insertarPaquete(didclienteLocal_ext, 0, dataQr, dbConnection, 1, 1, companyId);
                        await insertEnviosExteriores(didpaquete_ext, didpaquete_local, dbConnection, 1, nombre_fantasia, idempresaExterna);

                        const sqlChofer = `
                            SELECT usuario 
                            FROM sistema_usuarios_accesos 
                            WHERE superado = 0 AND elim = 0 AND codvinculacion = ?
                        `;
                        const rowsChofer = await executeQuery(connectionE, sqlChofer, ["cogote"]);
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

                            fsetestadoConector(didpaquete_local, 0, dbConnection);

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

                            await fsetestadoConector(connectionE, didpaquete_ext);

                            paqueteExternoInsertdo = true;

                            return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };
                        }
                    }
                }
                await connectionE.end();
            }
        }

        if (!paqueteExternoInsertdo) {
            return { estadoRespuesta: false, mensaje: "Error al querer insertar el paquete1 (FE) - FLEX" };
        }
    } else {
        if (!paquetecargado) {
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

                const ok = await fsetestadoConector(dbConnection, didpaquete);

                if (ok) {
                    return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };
                } else {
                    return { estadoRespuesta: false, mensaje: "Error al poner el paquete como retirado - FLEX" };
                }
            }
        } else {
            const didpaquete_local = await insertarPaquete(didcliente, 0, dataQr, dbConnection, 1, 0, companyId);
            await insertoDataQR(didpaquete_local, dataQr, dbConnection);

            if (didpaquete_local !== -1) {

                const ok = await fsetestadoConector(dbConnection, didpaquete);
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
                if (ok) {
                    return { estadoRespuesta: true, mensaje: "Paquete insertado y colectado - FLEX" };
                } else {
                    return { estadoRespuesta: false, mensaje: "Error al poner el paquete como retirado - FLEX" };
                }
            } else {
                return { estadoRespuesta: false, mensaje: "Error al insertar el paquete - FLEX" };
            }
        }
    }
}