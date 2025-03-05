<?php

if(isset($Adatos["dataQR"])){
	$dataQR = $Adatos["dataQR"];
}else{
	$dataQR = $Adatos["data"];
}

$codigovinculacionMIO = "";
if(isset($AempresasGlobal[$GLOBAL_empresa_id])){
	$codigovinculacionMIO = $AempresasGlobal[$GLOBAL_empresa_id]["codigo"];
}


$AdataQR = json_decode($dataQR, true);
$colectado = false;
$esflex = (isset($AdataQR["local"])) ? false : true;
$autoasignar = (isset($Adatos["autoasignar"]))? $Adatos["autoasignar"] : 0;


//file_put_contents("autoasignar.txt", $autoasignar);

//horas de despaCHO
$Ahorasdespacho = [];
$redisKey = "Ahorasdespacho_{$GLOBAL_empresa_id}";
$AhorasdespachoJson = $redis->get($redisKey);
if ($AhorasdespachoJson === false) { // Si no existe en Redis
    // Realizar la consulta a la base de datos
    $sql = "SELECT didcliente, hora FROM `clientes_cierre_ingreso` WHERE superado=0 AND elim=0 AND hora != 0 ORDER BY `id` DESC";
    $result = mysqli_query($mysqli, $sql);  
    while ($row = mysqli_fetch_array($result, MYSQLI_ASSOC)) {
        $Ahorasdespacho[$row["didcliente"]] = $row["hora"];
    }
    mysqli_free_result($result);
    
    // Almacenar en Redis con un tiempo de expiración de 1 hora (3600 segundos)
    $redis->setex($redisKey, 3600, json_encode($Ahorasdespacho));

    // Guardar la fecha de almacenamiento en Redis
    $redis->setex("{$redisKey}_fecha", 3600, date("Y-m-d H:i:s"));
} else {
    // Decodificar el JSON almacenado en Redis
    $Ahorasdespacho = json_decode($AhorasdespachoJson, true);
}

//creacion del temp de cuentas por empresa
$Amiscuentas = [];
$redisKey = "miscuentasclientes_{$GLOBAL_empresa_id}";
$AmiscuentasJson = $redis->get($redisKey);
if ($AmiscuentasJson === false) { // Si no existe en Redis
    // Realizar la consulta a la base de datos
    $sql3 = "SELECT did, didCliente, ML_id_vendedor FROM `clientes_cuentas` WHERE superado=0 AND elim=0 AND tipoCuenta=1";
    $result = mysqli_query($mysqli, $sql3);  
    while ($row = mysqli_fetch_array($result, MYSQLI_ASSOC)) {
        $Amiscuentas[$row["ML_id_vendedor"]] = array(
            "didcliente" => $row["didCliente"],
            "didcuenta" => $row["did"]
        );
    }  
    mysqli_free_result($result);
    
    // Almacenar en Redis con un tiempo de expiración de 1 hora (3600 segundos)$redisKey = "miscuentasclientes_{$GLOBAL_empresa_id}";
    $redis->setex($redisKey, 120, json_encode($Amiscuentas));

    // Guardar la fecha de almacenamiento en Redis
    $redis->setex("{$redisKey}_fecha", 120, date("Y-m-d H:i:s"));
} else {
    // Decodificar el JSON almacenado en Redis
    $Amiscuentas = json_decode($AmiscuentasJson, true);
}

/*---------------------------------------------------------------------------------------------------*/
function informe($perfil,$quien,$mysqli){
	
	$sql = "SELECT count(eh.id) as total, concat( su.nombre,' ',su.apellido) as cadete
			FROM `envios_historial` as eh
			JOIN sistema_usuarios as su on ( su.elim=0 and su.superado=0 and su.did = eh.quien)
			where eh.superado=0 and eh.estado=0 and eh.quien = $quien
			GROUP BY eh.quien ";
	$result = mysqli_query($mysqli, $sql);
	while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
		$aretirar = $row["total"];
		$namecliente = $row["cadete"];
	}
	mysqli_free_result($result);
	
	return array("namecliente"=> $namecliente , "aretirar"=> $aretirar);
}

function informePro($perfil,$quien,$mysqli){
	
    $nuevosColectados = 0;
    $colectados = 0;

    if($perfil == 3){
        $hoy = date("Y-m-d")." 00:00:00";

        //busco todos los colectados hoy por mi
        $sql = "SELECT count(id) as total FROM `envios_historial`  Where autofecha >  '$hoy' and estado=1 and quien = $quien";
        $result = mysqli_query($mysqli, $sql);
        while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
            $colectados =  $row["total"];
        }
        mysqli_free_result($result);
        //busco todos los nuevos insertados hoy por mi
        $sql = "SELECT count(id) as total FROM `envios`  Where fecha_inicio >  '$hoy' and quien = $quien and superado=0 and elim=0";
        $result = mysqli_query($mysqli, $sql);
        while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
            $nuevosColectados =  $row["total"];
        }
        mysqli_free_result($result);
    }else{
		$hoy = date("Y-m-d")." 00:00:00";
		
		$sql = "SELECT count(id) as total FROM `envios_historial`  Where autofecha >  '$hoy' and estado=1 and quien = $quien";
        $result = mysqli_query($mysqli, $sql);
        while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
            $colectados =  $row["total"];
        }
        mysqli_free_result($result);
		
		$sql = "SELECT count(id) as total FROM `envios`  Where fecha_inicio like  '$hoy%' and quien = $quien and superado=0 and elim=0";
        $result = mysqli_query($mysqli, $sql);
        while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
            $nuevosColectados =  $row["total"];
        }
        mysqli_free_result($result);
	}
	
	return array("colectados"=> strval($colectados), "nuevosColectados"=> strval($nuevosColectados));
}

function obtenerToTales($didCliente, $quien, $didenvio ,$mysqli){
	
	$clientename = "";
	$sql = "SELECT nombre_fantasia FROM clientes where superado=0 and elim=0 and did = $didCliente";
	//file_put_contents("consulta.txt", $sql);
	$result = mysqli_query($mysqli, $sql);
    while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
        $clientename = $row["nombre_fantasia"];
    }
    mysqli_free_result($result);

    $hoy = date("Y-m-d");
    $aingresarhoy = 0;
    $ingresadoshot = 0;
    $ingresadosahora = 0;
    $choferasignado = "";
    $zonaentrega = "";
	$cliente_total = 0;
    
    //Iingresados hoy
    //$sql = "SELECT count(id) as total FROM `envios` where superado=0 and elim=0 and autofecha like '$hoy%' and didCliente = $didCliente and estado_envio in (1)";
    $sql = "SELECT count(id) as total FROM `envios` where superado=0 and elim=0 and ( autofecha > '$hoy 00:00:00' and autofecha < '$hoy 23:59:59' )  and didCliente = $didCliente ";
    $result = mysqli_query($mysqli, $sql);
    while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
        $ingresadoshot = $row["total"];
    }
    mysqli_free_result($result);
	
	$ayer = date("Y-m-d",strtotime($hoy."- 7 days"));


	//total a colectar del cliente
	$sql = "SELECT count(e.id) as total
			FROM `envios` as e
			JOIN envios_historial as eh on ( eh.elim=0 and eh.superado=0 and eh.estado=7 and eh.didEnvio = e.did ) 
			Where e.superado=0 and e.elim=0 and e.didCliente = $didCliente  and eh.fecha > '$ayer 00:00:00' ";
    $result = mysqli_query($mysqli, $sql);
    while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
        $cliente_total = $row["total"];	
		$aingresarhoy = $row["total"];			
    }
    mysqli_free_result($result);

    //datos del paquete
    if($didenvio > 0){
		$sql = "SELECT ez.nombre as zona, concat( su.nombre,' ', su.apellido) as chofer
			FROM `envios` as e 
			LEFT JOIN envios_zonas as ez on ( ez.elim=0 and ez.superado=0 and ez.did = e.didEnvioZona)
			LEFT join envios_asignaciones as ea on ( ea.elim=0 and ea.superado=0 and ea.didEnvio = e.did)
			LEFT join sistema_usuarios as su on ( su.superado=0 and su.elim=0 and su.did = ea.operador )
			Where e.superado=0 and e.elim=0 and e.did = $didenvio";
        $result = mysqli_query($mysqli, $sql);
        while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
            $choferasignado = $row["chofer"];
            $zonaentrega = $row["zona"];
        }
        mysqli_free_result($result);
    }
	
	if(is_null($choferasignado)){
		$choferasignado = "";
	}
	if(is_null($zonaentrega)){
		$zonaentrega = "";
	}


	$retiradoshoymi = 0;
	//retirados hoy por mi
	$sql = "SELECT count(id) as total FROM `envios_historial` where superado=0 and elim=0 and quien in ($quien) and ( autofecha > '$hoy 00:00:00' and autofecha < '$hoy 23:59:59' ) and estado=0";
    $result = mysqli_query($mysqli, $sql);
    while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
        $retiradoshoymi = $row["total"];
    }
    mysqli_free_result($result);
	
	/*
		$cliente = $dataTotales["cliente"];
				$aretirarHoy = $dataTotales["aingresarhoy"];
				$retiradoshoy = $dataTotales["ingresadoshoy"];
				$retiradoshoymi = $dataTotales["retiradoshoymi"];
				$retiradosahora = $dataTotales["ingresadosahora"];
				$ingresados = $dataTotales["ingresados"];
				$cliente_total = $dataTotales["cliente_total"];
	*/
   
    return array("cliente"=> $clientename,"ingresados"=>0,"cliente_total"=>$cliente_total ,"retiradoshoymi"=> $retiradoshoymi, "aingresarhoy"=> $aingresarhoy , "ingresadoshoy"=> $ingresadoshot , "ingresadosahora"=> $ingresadosahora , "choferasignado"=> $choferasignado, "zonaentrega"=> $zonaentrega);
}

function empresaDuenia($codigo){
	GLOBAL $AempresasGlobal;
	$e = "";
		
	foreach($AempresasGlobal as $empresa){
		
		//echo "{$empresa["codigo"]}  == $codigo";
		
		if($empresa["codigo"] == $codigo){
			$e = $empresa;
			
			//print_r($empresa);
			
			break;
		}
	}
	return $e;
}

function insertoDataQR($didEnvio, $AdataQR, $mysqli){
	$ml_qr_seguridad = json_encode($AdataQR);
	$con = "UPDATE envios SET ml_qr_seguridad = '{$ml_qr_seguridad}' WHERE superado=0 AND elim=0 AND did = '{$didEnvio}'  LIMIT 1";
	$stmt = $mysqli->prepare($con);
	$stmt->execute();
	$stmt->close();
	
}

function insertarPaquete($didcliente,$didcuenta,$AdataQR,$mysqli,$flex,$externo,$idempresa){
	GLOBAL $Ahorasdespacho;
	
	$oe = new Envio();
    $lote = $oe->fgeneradorLotesExterno();   
	$fecha_inicio = date("Y-m-d H:i:s");	
	$idnuevo = -1;
	$quien = 1;
	$did = 0;
	$idshipment = $AdataQR["id"];
	$senderid = $AdataQR["sender_id"];
	$ml_qr_seguridad = json_encode($AdataQR);
	//$externo = 1;
	$fechaunix = time();
	
	$horaactual = date("G")*1;
	$horacorte = (isset($Ahorasdespacho[$didcliente])) ? $Ahorasdespacho[$didcliente] : 16;
	$fecha_despacho = date("Y-m-d");
	if($horaactual > $horacorte){
		$fecha_despacho = date("Y-m-d",strtotime($fecha_despacho."+ 1 days")); 
	}
	
	$con = "INSERT INTO envios (did,ml_shipment_id,ml_vendedor_id,didCliente,quien,lote,didCuenta,ml_qr_seguridad,fecha_inicio,flex,exterior,fecha_despacho,fechaunix) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";
	$stmt = $mysqli->prepare($con);
	$stmt->bind_param("issiisissiisi",$did,$idshipment,$senderid,$didcliente,$quien,$lote,$didcuenta,$ml_qr_seguridad,$fecha_inicio,$flex,$externo,$fecha_despacho,$fechaunix);
	if($stmt->execute()){
		$idnuevo = $stmt->insert_id;
	}else{
		//echo $stmt->error;
	}
	$stmt->close();
	if($idnuevo > -1){
		
		sendEnviosLDInsertPaquete($idempresa, $idnuevo);

		$con = "UPDATE envios SET did = $idnuevo WHERE superado=0 AND elim=0 AND id = $idnuevo  LIMIT 1";
		$stmt = $mysqli->prepare($con);
		$stmt->execute();
		$stmt->close();
	}
	
	return $idnuevo;
}

function ponerRetirado($didpaquete,$mysqli,$didquien){	
	$envio = new Envio();
	$_SESSION["user"] = $didquien;
	$fecha = date("Y-m-d H:i:s");
	$nada = $envio->fsetestadoConector($didpaquete,0,$fecha,$mysqli);
	return true;
}

function asignarPaqueteChofer($didchofer,$didpaquete,$mysqli,$autoasignar){	
	$AdidEnvio = array();
    $AdidEnvio[] = $didpaquete;
    $_SESSION["movil"] = "1";
    $_SESSION["user"] = 0;
	if($autoasignar == 1){
		$_SESSION["user"] = $didchofer;
	}
    $envio = new Envio();
    $nada = $envio->fasignarOperadorConector($didchofer,$AdidEnvio,$mysqli);
}

function crearVinculacion($didpaquete_ext, $didpaquete_local , $mysqli , $flex, $nameexterno, $idempresaExerna){
	
	$con = "INSERT INTO envios_exteriores (didLocal,didExterno,flex,cliente,didEmpresa) VALUES (?,?,?,?,?)";
	$stmt = $mysqli->prepare($con);
	$stmt->bind_param("iiisi",$didpaquete_local,$didpaquete_ext,$flex,$nameexterno,$idempresaExerna);
	$stmt->execute();
	$stmt->close();
	
}

function colecta($dataQR, $autoasignar){
	GLOBAL $AempresasGlobal;
	GLOBAL $GLOBAL_empresa_id; 
	GLOBAL $esflex;
	GLOBAL $mysqli;
	GLOBAL $db_host;
	GLOBAL $perfil;
	GLOBAL $quien;
	GLOBAL $codigovinculacionMIO;
	GLOBAL $esaplantanormal;
	GLOBAL $aplantaNginforme;
	GLOBAL $Amiscuentas;
	GLOBAL $redis;
	
	$dataQR = str_replace(" ","",$dataQR);
	$AdataQR = json_decode($dataQR, true);
	
	if( (!isset($AdataQR["did"])) && (!isset($AdataQR["id"])) ){
		$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Los datos escaneados no son válidos");
		return $respuesta;
		//exit();
	}


	$todobien = false;
	
	$paquetecargado = false;
	$didpaquete = -1;
	$didcliente = -1;
	$didcuenta = -1;
	$estado_envio = -1;
	$quienpaquete = $quien;
	
	$didClienteInforme = 0;
	$didenvioInforme = 0;
	
	if(isset($AempresasGlobal[$GLOBAL_empresa_id])){
		$AdataEmpresaLocal = $AempresasGlobal[$GLOBAL_empresa_id];
		
		if($esflex){
			
			if($GLOBAL_empresa_id == 149 && $GLOBAL_empresa_id == 150 ){
				$AdataQR = json_decode($AdataQR["data"],true);
			}

			$senderid = $AdataQR["sender_id"];
			$senderid = str_replace(" ","",$senderid);
			$idshipment = $AdataQR["id"];
			$ml_qr_seguridad = $dataQR;
			$tengoQR = false;
			
			//esto es para cuando el cliente es TecnoGO de E-envios
			if($GLOBAL_empresa_id == 136){
				$Amiscuentas["58659359"] = array("didcliente"=>9,"didcuenta"=>0);
				$Amiscuentas["793886457"] = array("didcliente"=>9,"didcuenta"=>0);
				$Amiscuentas["307797200"] = array("didcliente"=>9,"didcuenta"=>0);
				$Amiscuentas["80816229"] = array("didcliente"=>9,"didcuenta"=>0);
				$Amiscuentas["541143304"] = array("didcliente"=>9,"didcuenta"=>0);
				$Amiscuentas["436897509"] = array("didcliente"=>9,"didcuenta"=>0);
			}
			

			if(isset($Amiscuentas[$senderid])){
				$didcliente = $Amiscuentas[$senderid]["didcliente"];
				$didcuenta = $Amiscuentas[$senderid]["didcuenta"];
				$didClienteInforme = $didcliente;
			}else{

				$Amiscuentas = array();
				$sql3 = "SELECT did, didCliente, ML_id_vendedor FROM `clientes_cuentas` WHERE superado=0 AND elim=0 AND tipoCuenta=1";
				$result = mysqli_query($mysqli, $sql3);  
				while ($row = mysqli_fetch_array($result, MYSQLI_ASSOC)) {
					$Amiscuentas[$row["ML_id_vendedor"]] = array(
						"didcliente" => $row["didCliente"],
						"didcuenta" => $row["did"]
					);
				}  
				mysqli_free_result($result);

				$redisKey = "miscuentasclientes_{$GLOBAL_empresa_id}";
   				$redis->setex($redisKey, 120, json_encode($Amiscuentas));

				if(isset($Amiscuentas[$senderid])){
					$didcliente = $Amiscuentas[$senderid]["didcliente"];
					$didcuenta = $Amiscuentas[$senderid]["didcuenta"];
					$didClienteInforme = $didcliente;
				}
				
			}
						
			//Busco si ya tengo el paquete en mi base de datos
			$sql2 = "SELECT did,estado_envio,didCliente,didCuenta,ml_qr_seguridad FROM `envios` WHERE superado=0 and elim=0 and ml_shipment_id = '{$idshipment}' and ml_vendedor_id = '{$senderid}' LIMIT 1";	
			$result = mysqli_query($mysqli, $sql2);
			while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
				$didpaquete = $row["did"];
				$didenvioInforme  = $didpaquete;	
				$estado_envio = $row["estado_envio"]*1;
				$didcliente = $row["didCliente"];
				$didcuenta = $row["didCuenta"];
				if($row["ml_qr_seguridad"] != ""){
					$tengoQR = true;
				}
				$paquetecargado = true;
			}
			mysqli_free_result($result);
			
			if(!$tengoQR){
				insertoDataQR($didenvioInforme, $AdataQR, $mysqli);
			}
			
			//si fue entregado ya aviso
			if($didpaquete != -1){
				$fueentregado = false;
						
				$sql = "SELECT id FROM envios_historial WHERE didEnvio=$didpaquete and estado=5";
				$result = mysqli_query($mysqli, $sql);
				while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
					$fueentregado = true;
				}
				mysqli_free_result($result);
				if($fueentregado){
					$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"El paquete ya fue entregado con anterioridad.");
					echo json_encode($respuesta, true);	
					$mysqli->close();
					exit();
				}
			}

			if($didpaquete != -1){
				
				$colectado = false;
				$sql = "SELECT id FROM `envios_historial` where didEnvio = $didpaquete and estado=0";
				$result = mysqli_query($mysqli, $sql);
				while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
					$colectado = true;
				}
				mysqli_free_result($result);
				
				if($colectado){
					return  array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"El paquete ya se encuentra colectado - FLEX");
				}
			}			

			//echo "$didcliente == -1 && $didpaquete == -1";
			
			//me traigo todos los clientes externos que manejo en mi sistema
			if($didcliente == -1 && $didpaquete == -1){
							
				$Aexternas = array();
				$sql = "SELECT did,nombre_fantasia,codigoVinculacionLogE FROM `clientes` where superado=0 and elim=0 and codigoVinculacionLogE != ''";
				$result = mysqli_query($mysqli, $sql);
				while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
					$Aexternas[] = $row;
				}
				mysqli_free_result($result);
				
				$paqueteExternoInsertdo = false;

				foreach($Aexternas as $clienteexterno){
					
					$codigovinculacion = $clienteexterno["codigoVinculacionLogE"];
					$dataEmpresaExterna = empresaDuenia($codigovinculacion);
					$didclienteLocal_ext = $clienteexterno["did"];
					$idempresaExerna = $dataEmpresaExterna["id"];
					$nombre_fantasia = $clienteexterno["nombre_fantasia"];
					
					//echo "a=> |$codigovinculacion| $dataEmpresaExterna";
					
					if ($dataEmpresaExterna != ''){
						
						$clienteExiste_ext = false;
						$didcliente_ext = -1;
						$didcuenta_ext = -1;
						$clienteExiste = false;
						
						//me conecto a la base de datos
						$mysqliE = new mysqli($db_host, $dataEmpresaExterna["dbuser"], $dataEmpresaExterna["dbpass"], $dataEmpresaExterna["dbname"]);
						$mysqliE->set_charset("utf8");
						
						//busco si existe el cliente
						$sql = "SELECT did,didCliente FROM `clientes_cuentas` WHERE superado=0 and elim=0 and tipoCuenta=1 and ML_id_vendedor = '$senderid' ";
						$result = mysqli_query($mysqliE, $sql);
						while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
							$didcliente_ext =  $row["didCliente"];
							$didcuenta_ext = $row["did"];
							$clienteExiste = true;
						}
						mysqli_free_result($result);
						
						
						//echo $didcliente_ext;
			
						if ($clienteExiste){
							$paqueteExistente = false;
							$didpaquete_ext = -1;
							$didpaquete_local = -1;
							
							//busco el nombre del cliente externo
							$nombre_fantasia_ext = "";
							$sql = "SELECT nombre_fantasia FROM `clientes` WHERE superado=0 and elim=0 and did = $didcliente_ext ";
							$result = mysqli_query($mysqliE, $sql);
							while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
								$nombre_fantasia_ext =  $row["nombre_fantasia"];
							}
							mysqli_free_result($result);

							//busco si existe el paquete
							$sql = "SELECT did,estado_envio,didCliente,didCuenta FROM `envios` WHERE superado=0 and elim=0 and ml_shipment_id = '{$idshipment}' and ml_vendedor_id = '{$senderid}' LIMIT 1";
							$result = mysqli_query($mysqliE, $sql);
							while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
								$didpaquete_ext = $row["did"];
								$paqueteExistente = true;
							}
							mysqli_free_result($result);
							
							
							//si no existe
							if(!$paqueteExistente){
								$didpaquete_ext = insertarPaquete($didcliente_ext,$didcuenta_ext,$AdataQR,$mysqliE,1,0, $idempresaExerna);
							}
							//insertar aca
							
							
							if($didpaquete_ext != -1 ){								
								$didpaquete_local = insertarPaquete($didclienteLocal_ext,0,$AdataQR,$mysqli,1,1, $GLOBAL_empresa_id);
							}
							
							if($didpaquete_local != -1 && $didpaquete_ext != -1){
								//insertar datos vinculantes
								$insertadoVinculacion = crearVinculacion($didpaquete_ext, $didpaquete_local , $mysqli, 1 , $nombre_fantasia_ext, $idempresaExerna);
								
								
								
								//(para esto necesito el did chofer de alla)
								$didchofer = -1;
								$sql = "SELECT usuario FROM `sistema_usuarios_accesos` where superado=0 and elim=0 and codvinculacion = '$codigovinculacionMIO';";
								$result = mysqli_query($mysqliE, $sql);
								while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
									$didchofer = $row["usuario"];
								}
								mysqli_free_result($result);
								
								if($didchofer > -1 ){
									
									$didClienteInforme = $didclienteLocal_ext;
									$didenvioInforme  = $didpaquete_local;	
									
									//asignar ese paquete a chofer logistica externa 
									asignarPaqueteChofer($didchofer,$didpaquete_ext,$mysqliE, 0);
									//aca agregar el estado a planta
									$ok = ponerRetirado($didpaquete_local,$mysqli,$quienpaquete);
									if($ok){
										//pongo retirado en el exterior
										$ok = ponerRetirado($didpaquete_ext,$mysqliE,$didchofer);
										$paqueteExternoInsertdo = true;
									}
								}
							}
							
							break;
						}
						
						//cierro base de datos externa
						$mysqliE->close();
					}
					
					
				}
				
				
				if($paqueteExternoInsertdo){
					$todobien = true;
				}else{
					if(sizeof($Aexternas)==0){
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"NO hay datos cargados para es ID de vendedor");
					}else{
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Error al querer insertar el paquete (FE) - FLEX");
					}
				}
				
			}else{
			
				//verifico si esta cargado 
				if($paquetecargado){
					//si esta colectado ya lo indico
					if($estado_envio == 0){
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"El paquete ya se encuentra colectado - FLEX");
					}else{
						//lo pongo colectado
						$didenvioInforme  = $didpaquete;		
						$ok = ponerRetirado($didpaquete,$mysqli,$quienpaquete);
						
						if($autoasignar == 1){							
							asignarPaqueteChofer($quienpaquete,$didpaquete,$mysqli, 1);
						}
						
						if($ok){
							$todobien = true;
						}else{
							$respuesta = array("estadoRespuesta"=>true,"body"=> null,"mensaje"=>"Paquete insertado y error de puesto a planta (L1)- FLEX");
						}
					}
				}else{
					//inserto paquete local
					$didpaquete_local = -1;
					
					//$AdataQR2 = $AdataQR["data"];
					$didpaquete_local = insertarPaquete($didcliente,$didcuenta,$AdataQR,$mysqli,1,0,$GLOBAL_empresa_id);
					//lo pongo a coelcta
					if($didpaquete_local != -1){
						$didenvioInforme  = $didpaquete_local;		
						$ok = ponerRetirado($didpaquete_local,$mysqli,$quienpaquete);
						
						if($autoasignar == 1){							
							asignarPaqueteChofer($quienpaquete,$didpaquete_local,$mysqli, 1);
						}
						
						if($ok){
							$todobien = true;
						}else{
							$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Paquete insertado y error de puesto a planta (L2) - FLEX");
						}
					}else {
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Error al querer insertar el paquete - FLEX");
					}
				}
			
			}
			
						
		}else{
			
			$esmio = ($GLOBAL_empresa_id == $AdataQR["empresa"]) ? true :false;
			
			$didclientePaquete = $AdataQR["cliente"];
			$didenvioPaquete = $AdataQR["did"];
			$didempresa = $AdataQR["empresa"];
			
			if($esmio){
				
				//si fue entregado ya aviso
				$fueentregado = false;		
				$sql = "SELECT id FROM envios_historial WHERE didEnvio=$didenvioPaquete and estado=5";
				$result = mysqli_query($mysqli, $sql);
				while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
					$fueentregado = true;
				}
				mysqli_free_result($result);
				if($fueentregado){
					$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"El paquete ya fue entregado con anterioridad.");
					echo json_encode($respuesta, true);	
					$mysqli->close();
					exit();
				}
				
				$didClienteInforme =$didclientePaquete;
				$didenvioInforme  = $didenvioPaquete;		
				
				//si es mio
				$estado_envio = -1;
				$sql = "SELECT estado_envio FROM `envios` WHERE superado=0 and elim=0 and did = $didenvioPaquete LIMIT 1";
				$result = mysqli_query($mysqli, $sql);
				while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
					$estado_envio = $row["estado_envio"];
				}
				mysqli_free_result($result);
				
				if($estado_envio == 0){
					
					$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"El paquete ya se encuentra retirado");
				}else{
					$ok = ponerRetirado($didenvioPaquete,$mysqli,$quienpaquete);
									
					if($ok){
						
						if($autoasignar == 1){							
							asignarPaqueteChofer($quienpaquete,$didenvioPaquete,$mysqli, 1);
						}
						
						$todobien = true;
					}else{
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Paquete insertado y error de puesto a planta (NOL2)");
					}
				}
				
			}else{
				
				$yaestacargado = false;
				$didenvio = 0;
				
				$sql = "SELECT didLocal FROM `envios_exteriores` where superado=0 and elim=0 and didExterno = $didenvioPaquete and didEmpresa = $didempresa";
				$result = mysqli_query($mysqli, $sql);
				while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
					$didenvio = $row["didLocal"];
					$yaestacargado = true;
				}
				mysqli_free_result($result);
				

				if(!$yaestacargado){	
					//BUSCO EN MIS CLIENTES
					$Aexternas = array();
					$sql = "SELECT did,nombre_fantasia,codigoVinculacionLogE FROM `clientes` where superado=0 and elim=0 and codigoVinculacionLogE != ''";
					$result = mysqli_query($mysqli, $sql);
					while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
						$Aexternas[] = $row;
					}
					mysqli_free_result($result);
					
					$procesado = false;

					foreach($Aexternas as $clienteexterno){
						
						$codigovinculacion = $clienteexterno["codigoVinculacionLogE"];
						$dataEmpresaExterna = empresaDuenia($codigovinculacion);
						$idempresaExerna = $dataEmpresaExterna["id"];
						$nombre_fantasia = $clienteexterno["nombre_fantasia"];
						$didclienteExterior = $clienteexterno["did"];
						
						if($idempresaExerna != $didempresa){
							continue;
						}
						
						if ($dataEmpresaExterna != ''){
							
							//inserto el paquete localmente
							$temp = array();
							$temp["id"] = "";
							$temp["sender_id"] = "";
							$didlocal = insertarPaquete($didclienteExterior,0,$temp,$mysqli,0,1, $idempresaExerna);
							
							if($autoasignar == 1){							
								asignarPaqueteChofer($quienpaquete,$didlocal,$mysqli, 1);
							}
							
							$didenvioInforme  = $didlocal;
							
							//me conecto a la base de datos
							$mysqliE = new mysqli($db_host, $dataEmpresaExterna["dbuser"], $dataEmpresaExterna["dbpass"], $dataEmpresaExterna["dbname"]);
							$mysqliE->set_charset("utf8");
							
							//busco el nombre del cliente externo
							$nombre_fantasia_ext = "";
							$sql = "SELECT cl.nombre_fantasia FROM envios as e JOIN `clientes`as cl on (cl.superado=0 and cl.elim=0 and cl.did = e.didCliente) WHERE e.superado=0 and e.elim=0 and e.did = $didenvioPaquete ";
							$result = mysqli_query($mysqliE, $sql);
							while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
								$nombre_fantasia_ext =  $row["nombre_fantasia"];
							}
							mysqli_free_result($result);
							
							//insertar datos vinculantes
							$insertadoVinculacion = crearVinculacion($didenvioPaquete, $didlocal , $mysqli, 0, $nombre_fantasia_ext, $idempresaExerna);
							
							//para esto necesito el did chofer de alla)
							$didchofer = -1;
							$sql = "SELECT usuario FROM `sistema_usuarios_accesos` where superado=0 and elim=0 and codvinculacion = '$codigovinculacionMIO';";
							$result = mysqli_query($mysqliE, $sql);
							while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
								$didchofer = $row["usuario"];
							}
							mysqli_free_result($result);
							
							if($didchofer > -1){
								
								$didClienteInforme = $didclienteExterior;
								
								asignarPaqueteChofer($didchofer,$didenvioPaquete,$mysqliE, 0);
								//aca agregar el estado a planta
								$ok = ponerRetirado($didlocal,$mysqli,$quienpaquete);
								if($ok){
									//pongo retirado en el exterior
									$ok = ponerRetirado($didenvioPaquete,$mysqliE,$didchofer);
									$procesado = true;
								}
								
							}
							
							//cierro base de datos externa
							$mysqliE->close();
						}	
		
					}
					
					
					if($procesado){
						$todobien = true;
					}else{
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Error al querer insertar el paquete (FE)");
					}
					
				}else{
					
					//ESTO ES PARA VER SI YA TENGO UN EXTERNO NOFLEX EN MI BASE Y ACTUALIZO ESTADO
					$estado_envio = -1;
					$sql = "SELECT estado_envio FROM `envios` WHERE superado=0 and elim=0 and did = $didenvio LIMIT 1";
					$result = mysqli_query($mysqli, $sql);
					while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
						$estado_envio = $row["estado_envio"];
					}
					mysqli_free_result($result);
					
					$didenvioInforme  = $didenvio;
					
					$fueentregado = false;		
					$sql = "SELECT id FROM envios_historial WHERE didEnvio=$didenvio and estado=5";
					$result = mysqli_query($mysqli, $sql);
					while($row = mysqli_fetch_array($result,MYSQLI_ASSOC)){
						$fueentregado = true;
					}
					mysqli_free_result($result);
					if($fueentregado){
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"El paquete ya fue entregado con anterioridad.");
						echo json_encode($respuesta, true);	
						$mysqli->close();
						exit();
					}
					
					if($estado_envio == 0){
						
						$chofer = 0;
						$aingresarhoy = 0;
						$ingresadoshot = 0;
						$ingresadosahora = 0;
						$choferasignado = 0;
						$zonaentrega = "";
						
						
						$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"El paquete ya se encuentra colectado", "chofer"=> $chofer , "aingresarhoy"=> $aingresarhoy , "ingresadoshot"=> $ingresadoshot , "ingresadosahora"=> $ingresadosahora , "choferasignado"=> $choferasignado, "zonaentrega"=> $zonaentrega);
					}else{
						$ok = ponerRetirado($didenvio,$mysqli, $quienpaquete);
						if($ok){
							$todobien = true;
						}else{
							$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Paquete insertado y error de colectado (NOL2)");
						}
					}
					
				}

			}

		}
				
		//obtengo los totales del chofer
		
	}else{
		$respuesta = array("estadoRespuesta"=>false,"body"=> null,"mensaje"=>"Hay un error en la cuenta de la empresa");
	}
	
	if($todobien){
		
		if(!$esaplantanormal){
			$res = informePro($perfil,$quien,$mysqli);
			
			$colectados = $res["colectados"];
			$nuevosColectados = $res["nuevosColectados"];
			
			$subrespuesta = array("mensaje"=>"Paquete insertado y colectado", "colectados"=> $colectados, "nuevosColectados"=> $nuevosColectados);
			$subrespuesta = json_encode($subrespuesta);
			
			$respuesta = array("estadoRespuesta"=>true,"body"=>$subrespuesta, "mensaje"=>"Paquete insertado y colectado");
		} else {
			
			if(!isset($aplantaNginforme)){
				$res = informe($perfil,$quien,$mysqli);			
				$aretirar = $res["aretirar"];
				$didCliente = 1;
				$namecliente = $res["namecliente"];
				$soy = $quien;
				$respuesta = array("estadoRespuesta"=>true,"mensaje"=> "ingresado","body"=> array( "aretirar"=>$aretirar , "didcliente"=> $didCliente, "namecliente"=>$namecliente, "soy"=>$soy));
			}else{
				
				if($perfil == 3 && $autoasignar ==  1){
					$nada = asignarPaqueteChofer($quien,$didenvioInforme,$mysqli,$autoasignar);
					
					$con = "UPDATE envios_historial SET didCadete = $quien  WHERE superado=0 AND elim=0 AND  didEnvio = $didenvioInforme ";
					$stmt = $mysqli->prepare($con);
					$stmt->execute();
					$stmt->close();	
				}
				
				$dataTotales = obtenerToTales($didClienteInforme, $quien, $didenvioInforme ,$mysqli);
				
				//file_put_contents("dataTotales.json", json_encode($dataTotales) );
				//{"chofer":"Lightdataprueba","aingresarhoy":0,"ingresadoshoy":"0","ingresadosahora":0,"choferasignado":"lightdataOPER lightdataOPER","zonaentrega":""}
				$cliente = $dataTotales["cliente"];
				$aretirarHoy = $dataTotales["aingresarhoy"];
				$retiradoshoy = $dataTotales["ingresadoshoy"];
				$retiradoshoymi = $dataTotales["retiradoshoymi"];
				$retiradosahora = $dataTotales["ingresadosahora"];
				$ingresados = $dataTotales["ingresados"];
				$cliente_total = $dataTotales["cliente_total"];
				
				$respuesta = array("estadoRespuesta"=> true, "mensaje"=> "Colectado correctamente", "body"=>array( "cliente"=> $cliente ,"cliente_total"=>$cliente_total*1, "aretirarHoy"=> $aretirarHoy *1, "retiradoshoy"=> $retiradoshoy *1, "retiradoshoymi"=> $retiradoshoymi *1, "retiradosahora"=> $retiradosahora*1, "ingresados"=> $ingresados*1));
			}
			
			
		}
		
	}
	
	return $respuesta;
}

function sendEnviosLDInsertPaquete($didempresa, $didenvio){
	
	//  $data =Array(
	//  	'empresa' => $didempresa,
	//  	'operador' => 'cacheenvios', //vaciarcache - cacheenvios - vercache
	//  	'didenvio' => $didenvio,
	//  	'didchofer' => -1,
	//  	'didestado' => 0
	//  );
	 
	//  $data = json_encode($data);

	//  $curl = curl_init();

	//  curl_setopt_array($curl, array(
	//    CURLOPT_URL => 'https://enviosldata.lightdata.app/actualizacion/actualizacion',
	//    CURLOPT_RETURNTRANSFER => true,
	//    CURLOPT_ENCODING => '',
	//    CURLOPT_MAXREDIRS => 10,
	//    CURLOPT_TIMEOUT => 0,
	//    CURLOPT_FOLLOWLOCATION => true,
	//    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
	//    CURLOPT_CUSTOMREQUEST => 'POST',
	//    CURLOPT_POSTFIELDS =>$data,
	//    CURLOPT_HTTPHEADER => array(
	//  	'Content-Type: application/json'
	//    ),
	//  ));		

	//  $response = curl_exec($curl);


	//  //file_put_contents("outputTokenaaaaaaa.json", $response );
	//  curl_close($curl);
	 
}

$Aresponse =  colecta($dataQR,$autoasignar);
$response = json_encode($Aresponse);
$filename = "response".date("YmdHis").".txt";
//file_put_contents($filename,$response);
echo $response;
?>