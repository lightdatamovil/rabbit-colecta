import { executeQuery, getProdDbConfig, getCompanyByCode } from "../../../../db.js";
import { asignar } from "../../functions/asignar.js";
import mysql from 'mysql';
import { insertarPaquete } from "../../functions/insertarPaquete.js";

export async function handleExternalFlex(dbConnection, companyId, userId, profile, dataQr, autoAssign) {
    const senderid = dataQr.sender_id;
    const idshipment = dataQr.id;
    let didcliente = -1;
    let didpaquete = -1;
    let estado_envio = -1;
    let paquetecargado = false;

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

            const externalCompany = await getCompanyByCode(codigovinculacion);

            const dbConfigExt = getProdDbConfig(externalCompany);
            const dbConnectionExt = mysql.createConnection(dbConfigExt);
            dbConnectionExt.connect();

            const didclienteInterno_ext = clienteexterno.did;

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
                    externalShipmentId = await insertarPaquete(dbConnectionExt, idempresaExterna, didcliente_ext, didcuenta_ext, dataQr, 1, 0);
                }

                if (externalShipmentId !== -1) {
                    const didpaquete_interno = await insertarPaquete(dbConnection, companyId, didclienteInterno_ext, 0, dataQr, 1, 1,);
                    await insertEnviosExteriores(externalShipmentId, didpaquete_interno, dbConnection, 1, nombre_fantasia, idempresaExterna);

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

                        fsetestadoConector(didpaquete_interno, 0, dbConnectionExt);

                        if (autoAssign) {
                            const dqr = {
                                id: '44429054087',
                                sender_id: 413658225,
                                hash_code: 'ZpFyEQnGa+juvrAxbe83sWRg1S+8qZPyOgXGI1ZiqjY=',
                                security_digit: '0'

                            };

                            await asignar(companyId, userId, profile, dqr, userId, "jaja");
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
                await asignar(companyId, userId, profile, dataQr, userId, "jaja");
            }

            await fsetestadoConector(dbConnection, didpaquete);

            return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - FLEX" };

        }
    } else {
        const didpaquete_interno = await insertarPaquete(dbConnection, companyId, didcliente, 0, dataQr, 1, 0,);

        const queryUpdateEnvios = `
                UPDATE envios 
                SET ml_qr_seguridad = ?
                WHERE superado = 0 AND elim = 0 AND did = ?
                LIMIT 1
            `;

        await executeQuery(dbConnection, queryUpdateEnvios, [dataQr, didpaquete_interno]);


        await fsetestadoConector(dbConnection, didpaquete);
        if (autoAssign) {
            await asignar(companyId, userId, profile, dataQr, userId, "kaka");
        }

        return { estadoRespuesta: true, mensaje: "Paquete insertado y colectado - FLEX" };
    }
}