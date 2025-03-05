import { executeQuery, getProdDbConfig } from "../../../db";
import { asignar } from "../functions/asignar";
import { fsetestadoConector } from "../functions/ponerRetirado";

export async function handleLocalNoFlex(dbConnection, dataQr, companyId, userId, profile, autoAssign) {
    const didenvioPaquete = dataQr.did;

    const querySelectEnviosHistorial = `SELECT id, estado FROM envios_historial WHERE didEnvio = ? AND estado = 0`;

    const paqueteColectado = await executeQuery(dbConnection, querySelectEnviosHistorial, [didenvioPaquete]);

    if (paqueteColectado.length > 0 && paqueteColectado.estado == 0) {
        return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado - NOFLEX" };
    }

    const querySelectEnvios = `SELECT estado_envio FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;

    const shipmentState = await executeQuery(dbConnection, querySelectEnvios, [didenvioPaquete]);

    if (shipmentState.length === 0) {
        return { estadoRespuesta: false, mensaje: "Paquete no encontrado - NOFLEX" };
    }

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

    await sendToShipmentStateMicroService(companyId, didenvioPaquete, 0, null, null, userId);

    const ok = await fsetestadoConector(dbConnection, didenvioPaquete);

    return ok
        ? { estadoRespuesta: true, mensaje: "Paquete colectado correctamente - NOFLEX" }
        : { estadoRespuesta: false, mensaje: "Error al poner el paquete como retirado - NOFLEX" };


}
export async function handleNoFlexLogic(dataQr, companyId, userId, profile, autoAssign) {
    const dbConfigExt = getProdDbConfig(dataQr.empresa);
    const dbConnectionExt = mysql.createConnection(dbConfigExt);
    dbConnectionExt.connect();

    const didenvioPaquete = dataQr.did;

    let todobien = false;

    let didenvio = 0;

    const querySelectEnviosExteriores = 'SELECT didLocal FROM envios_exteriores WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?';

    const paqueteExterno = await executeQuery(dbConnectionExt, querySelectEnviosExteriores, [didenvioPaquete, empresaExterna.id]);

    if (paqueteExterno.length > 0) {
        didenvio = paqueteExterno[0].didLocal;

        const querySelectClientes = 'SELECT did, nombre_fantasia, codigoVinculacionLogE FROM clientes WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ""';

        const clientesExternos = await executeQuery(dbConnectionExt, querySelectClientes);

        let procesado = false;

        for (const cliente of clientesExternos) {

            const codigovinculacion = cliente.codigoVinculacionLogE;

            const empresaDueña = await empresaDuenia(codigovinculacion, Aempresasext);

            if (!empresaDueña) continue;

            const didlocal = await insertarPaquete(cliente.did, 0, { id: "", sender_id: "" }, connection, 0, 1, empresaDueña.id);

            const querySelectEnvios = 'SELECT cl.nombre_fantasia FROM envios AS eJOIN clientes AS cl ON cl.did = e.didCliente WHERE e.did = ?';

            const nombreFantasiaExterno = await executeQuery(dbConnectionExt, querySelectEnvios, [didenvioPaquete]);

            await insertEnviosExteriores(didenvioPaquete, didlocal, connection, 0, nombreFantasiaExterno[0]?.nombre_fantasia || "", AdataQR.empresa);

            const querySelectSistemUsuariosAccesos = 'SELECT usuario FROM sistema_usuarios_accesos WHERE codvinculacion = ?';

            const chofer = await executeQuery(dbConnectionExt, querySelectSistemUsuariosAccesos, [empresaDueña.codigo]);

            if (chofer.length > 0) {
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

                if (autoAssign) {
                    await asignar(payload)
                }

                const querySelectEnviosExteriores = 'SELECT didLocal FROM envios_exteriores WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?';

                const paqueteExterno = await executeQuery(connection, querySelectEnviosExteriores, [didenvioPaquete, empresaExterna.id]);

                await enviarAMQPRabbit(GLOBAL_empresa_id, dataQr.cliente, 0, null, null, body.userId);

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
                procesado = true;
            }
        }

        if (!procesado) return { estadoRespuesta: false, mensaje: "Error al querer insertar el paquete (FE)" };
        todobien = true;
    } else {
        const estadoExterno = await executeQuery(connection, `
            SELECT estado_envio FROM envios WHERE did = ? LIMIT 1
            `, [didenvio]);

        if (estadoExterno.length > 0 && estadoExterno[0].estado_envio === 0) {
            return { estadoRespuesta: false, mensaje: "El paquete ya se encuentra colectado E2" };
        }
        const ok = await fsetestadoConector(connection, didenvio);
        if (!ok) return { estadoRespuesta: false, mensaje: "Error al querer retirar el paquete (NOL2)" };
        todobien = true;
    }

    if (todobien) {
        await informePro(body.profile, body.userId, connection);
        return { estadoRespuesta: true, mensaje: "Paquete colectado con exito " };
    }
}