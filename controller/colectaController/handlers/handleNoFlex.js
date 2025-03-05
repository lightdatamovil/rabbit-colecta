import { executeQuery, getCompanyByCode, getCompanyById, getProdDbConfig } from "../../../db.js";
import { asignar } from "../functions/asignar.js";
import { sendToShipmentStateMicroService } from "../functions/sendToShipmentStateMicroService.js";
import { fsetestadoConector } from "../functions/ponerRetirado.js";
import mysql from "mysql";
import { insertarPaquete } from "../functions/insertarPaquete.js";

export async function handleLocalNoFlex(dbConnection, dataQr, companyId, userId, profile, autoAssign) {
    try {
        console.log("7");
        const didenvioPaquete = dataQr.did;

        const querySelectEnviosHistorial = `SELECT id, estado FROM envios_historial WHERE didEnvio = ? AND estado = 0`;

        const paqueteColectado = await executeQuery(dbConnection, querySelectEnviosHistorial, [didenvioPaquete]);

        if (paqueteColectado.length > 0 && paqueteColectado.estado == 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - NOFLEX" };
        }

        console.log("8");
        const querySelectEnvios = `SELECT estado_envio FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;

        const shipmentState = await executeQuery(dbConnection, querySelectEnvios, [didenvioPaquete]);

        if (shipmentState.length === 0) {
            return { estadoRespuesta: false, mensaje: "Paquete no encontrado - NOFLEX" };
        }

        console.log("9");
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

            console.log("10");
            await asignar(payload)
        }

        await sendToShipmentStateMicroService(companyId, userId, didenvioPaquete, 0, null, null);

        console.log("11");
        await fsetestadoConector(dbConnection, didenvioPaquete);

        console.log("12");
        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - NOFLEX" };

    } catch (error) {
        console.error("Error en handleLocalNoFlex:", error);
        throw error;
    }
}

export async function handleExternalNoFlex(dataQr, companyId, userId, profile, autoAssign) {
    try {
        const dbConfigExt = getProdDbConfig(dataQr.empresa);
        const dbConnectionExt = mysql.createConnection(dbConfigExt);
        dbConnectionExt.connect();

        console.log("2");
        const externalCompany = getCompanyById(dataQr.empresa);

        const didenvioPaquete = dataQr.did;

        let didenvio = 0;

        console.log("3");
        const querySelectEnviosExteriores = 'SELECT didLocal FROM envios_exteriores WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?';

        const paqueteExterno = await executeQuery(dbConnectionExt, querySelectEnviosExteriores, [didenvioPaquete, empresaExterna.id]);

        if (paqueteExterno.length > 0) {
            didenvio = paqueteExterno[0].didLocal;

            console.log("4");
            const querySelectClientes = 'SELECT did, nombre_fantasia, codigoVinculacionLogE FROM clientes WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ""';

            const clientesExternos = await executeQuery(dbConnectionExt, querySelectClientes);

            for (const cliente of clientesExternos) {

                const codigovinculacion = cliente.codigoVinculacionLogE;

                const company = await getCompanyByCode(codigovinculacion);

                const didlocal = await insertarPaquete(cliente.did, 0, { id: "", sender_id: "" }, connection, 0, 1, company.did);

                const querySelectEnvios = 'SELECT cl.nombre_fantasia FROM envios AS eJOIN clientes AS cl ON cl.did = e.didCliente WHERE e.did = ?';

                const nombreFantasiaExterno = await executeQuery(dbConnectionExt, querySelectEnvios, [didenvioPaquete]);

                await insertEnviosExteriores(didenvioPaquete, didlocal, connection, 0, nombreFantasiaExterno[0]?.nombre_fantasia || "", dataQr.empresa);

                const querySelectSistemUsuariosAccesos = 'SELECT usuario FROM sistema_usuarios_accesos WHERE codvinculacion = ?';

                const chofer = await executeQuery(dbConnectionExt, querySelectSistemUsuariosAccesos, [company.codigo]);

                console.log("5");
                if (chofer.length > 0) {
                    if (autoAssign) {
                        const payload = {
                            companyId: dataQr.empresa,
                            userId: userId,
                            profile: profile,
                            appVersion: "null",
                            brand: "null",
                            model: "null",
                            androidVersion: "null",
                            deviceId: "null",
                            dataQr: dataQr,
                            driverId: chofer[0].usuario,
                            deviceFrom: "Autoasignado de colecta"
                        };

                        await asignar(payload)
                    }

                    const querySelectEnviosExteriores = 'SELECT didLocal FROM envios_exteriores WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?';

                    const paqueteExterno = await executeQuery(connection, querySelectEnviosExteriores, [didenvioPaquete, externalCompany.did]);

                    console.log("6");
                    await enviarAMQPRabbit(companyId, dataQr.cliente, 0, null, null, userId);

                    await fsetestadoConector(connection, didlocal);

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
                            dataQr:
                            {
                                local: dataQr.local,
                                did: paqueteExterno[0].didLocal,
                                cliente: dataQr.cliente,
                                empresa: companyId
                            }
                            ,
                            driverId: userId,
                            deviceFrom: "Autoasignado de colecta"
                        };

                        await asignar(payload)
                    }
                    await enviarAMQPRabbit(dataQr.cliente, dataQr.did, 0, null, null, chofer[0].usuario);
                    await fsetestadoConector(connectionext, didenvioPaquete);
                }
            }
        } else {
            const querySelectEstadoEnvio = 'SELECT estado_envio FROM envios WHERE did = ? LIMIT 1';

            const estadoExterno = await executeQuery(connection, querySelectEstadoEnvio, [didenvio]);

            if (estadoExterno.length > 0 && estadoExterno[0].estado_envio === 0) {
                return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado" };
            }

            await fsetestadoConector(connection, didenvio);
        }

        await informePro(body.profile, body.userId, connection);
        return { estadoRespuesta: true, mensaje: "Paquete colectado con exito" };
    } catch (error) {
        throw error;
    }
}