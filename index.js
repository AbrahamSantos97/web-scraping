import puppeteer, { Page } from "puppeteer";  
import fs from "fs/promises";
import cron from "node-cron";
import requestBatchProcess from "./request-batch.js";   
import model from "./model-relaciones.js"

async function openBrowser(){
    //Iniciamos el navegador, el headless en false para ver el navegador, el slowMo para que nos de tiempo de ver la interaccion
    const browser = await puppeteer.launch({headless:false,slowMo:300});
    //Abrimos una nueva pestana del navegador
    const page = await browser.newPage();
    //Le decimos a donde iremos al navegador, es la vista de todas las tesis
    await page.goto('https://sjf2.scjn.gob.mx/busqueda-principal-tesis');
    //Damos click aqui para ver todas las tesis
    await page.click('.butAll');
    // En teoria el meotodo pasado deberia funcionar tambien para dar click al 'button-addon1_add' pero no es posible,
    //se hizo asi solo para poder disparar el evento
    await page.evaluate(()=> document.querySelector('#button-addon1_add').click());
    //Promesa que hacemos en lo que la pagina termina de cargar
    await timer();
    //Damos click a la primera referencia que se encuentre de una tesis, para verla completa
    const cadena = await page.evaluate(() => document.querySelectorAll("mat-selection-list > .text-center")[1].innerText);
    //Se obtiene la cantidad exacta de tesis que se necesitan recopilar
    const totalTesis = parseInt(cadena.match(/([\d])+/g)[2]);
    //El total de vueltas que se haran, para ir dandole una pausa cada 1000
    const real = parseInt((totalTesis/1000))+1;
    //Damos clic en el boton para ingresar a la primera tesis cargada
    await page.click("#linkVisit");
    //Promesa que hacemos en lo que la pagina termina de cargar
    await timer();
    for (let index = 0; index < real; index++) {
        let arr = await getTesis(100,page); 
        await fs.writeFile(`fichero-tesis-${index}.json`,JSON.stringify(arr),null,3);
 }
}

/**
 * Funcion que se hizo para normalizar la funcion de promesa en el traslado entre paginas, por defecto 3s.
 * @param {int} time 
 */
async function timer(time = 3000){
    await new Promise((resolve) => setTimeout(resolve,time));  
}

/**
 * Funcion que debe ser llamada cada sabado para el guardado de las tesis nuevas que se hayan cargado.
 */
async function weeklyRoutine(){
    const browser = await puppeteer.launch({
        headless:false,
        timeout: 300
    });

    const page = await browser.newPage();

    await page.goto('https://sjfsemanal.scjn.gob.mx/busqueda-principal-tesis');

    await timer();
    
    await page.click('.btn-primary.btn-search');
    
    await timer();

    const label = await page.evaluate(()=> document.querySelector("#paginationItems").innerText);

    const cadena = label.split(' ');
    
    const total = cadena[cadena.length - 1];

    await page.evaluate(()=>  document.querySelector('#divListResult').firstElementChild.click());

    await timer();

    const arr = await getTesis(total,page);

    await fs.writeFile('nuevas_tesis.json',JSON.stringify(arr),null,3);

    page.close();

    browser.close();
}

/**
 * Funcion asincrona que lo que hace es regresar un arreglo de json que contienen las tesis, asi como informacion relevante de la tesis.
 * @param {int} iteraciones - El numero de tesis que debe recorrer, debe ser calculado previamente, no tiene valor por defecto
 * @param {Page} page - Debe enviarse la pagina para poder acceder a los elementos HTML.
 * @returns {Array} -Arreglo de JSON obtenidos de las iteraciones.
 */
async function getTesis(iteraciones,page){
    let arr = [];
    for (let index = 0; index < iteraciones; index++) {
        const element = await page.evaluate(()=> {
            let body = {};
            [...document.querySelectorAll('.Temp')].map(e=> e.innerText).map(e=> e.split(': ')).forEach(elem =>{
                if(elem.length > 1){
                    const key = elem[0].replaceAll(' ','_').replaceAll('(s)','s').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    body[`${key}`] = elem[1].replaceAll("\\n",'');
                }else{
                    body.epoca = elem[0].replaceAll("\\n",'');
                }
             });
             const rubro = document.querySelector('#divRubro').innerText;
             const contenido = [...document.querySelectorAll('#divTexto > p')].map(cont => cont.innerText);
             const precedente = [...document.querySelectorAll('#divPrecedente > p')].map(cont => cont.innerText);
             const publicacion = document.querySelector('.publicacion').innerText;
             body.rubro = rubro;
             body.contenido = contenido
             body.precedente = precedente;
             body.publicacion = publicacion;
             const nextArrow = document.querySelector('li[ngbtooltip="Registro siguiente"]');
             if(nextArrow && !nextArrow.classList.contains('disabled')){
                nextArrow.firstElementChild.click();
             }
             return body;
        });
        element.iteracion = index;
        arr.push(element);

        const ahead = await page.evaluate(() => {
            const nextArrow = document.querySelector('li[ngbtooltip="Registro siguiente"]');
            return nextArrow && nextArrow.classList.contains('disabled');
        });
        if(ahead)break;
        await timer(2500);    
    }
    return arr;
}

async function startingGetRelations(){
    const browser = await puppeteer.launch({headless:false,slowMo:200});
    const page = await browser.newPage();
    await page.setViewport({width:1920,height:1080});
    for (let index = 0; index < 1; index++) {
        await page.goto(model[index].ruta);
        await page.reload();
        await timer();
        let btn;
        do{
            btn = await page.$('a[title="Consulta de tesis"]');
        }while(!btn);
        await timer(1000);
        await btn.click();
        await timer();
        let segundos = await page.$('a[title="Totales"]');
        if(segundos){
            await segundos.click();
        }
        await timer();
        await getRelaciones(page, model[index].materia);
    }
}

/**
 * Funcion asincrona que lo que hace es regresar un arreglo de json que contienen las tesis, asi como informacion relevante de la tesis.
 * @param {int} iteraciones - El numero de tesis que debe recorrer, debe ser calculado previamente, no tiene valor por defecto
 * @param {Page} page - Debe enviarse la pagina para poder acceder a los elementos HTML.
 * @returns {Array} -Arreglo de JSON obtenidos de las iteraciones.
 */
async function getRelaciones(page, materia) {
    const total = await page.$eval('.dataTables_info',elem => elem.innerText);
    let tot = total.match(/([\d])+/g)[2];
    tot = parseInt(tot);
    await page.evaluate(()=> {
        document.querySelector('tr[class="ng-scope"]').firstElementChild.click();
        document.querySelector('.icon-marcar-todo').parentElement.click();
        document.querySelector('.icon-visualizar').parentElement.click();
    });
    await timer();
    let arr = [];
    for (let index = 0; index < 100; index++) {
        const totalArticulos = await page.evaluate(()=> document.querySelector('h3 > small[class="ng-binding"]').innerText.match(/([\d])+/g)[1]);
        if(!totalArticulos)continue;
        await page.evaluate(()=> document.querySelectorAll('.icon-marcar-todo')[1].parentElement.click());
        let pivote = 0;
        let relaciones = [];
        do{
            const currentElement = await page.$$('table[template-pagination="custom/pager/articulos"]  td.bg-gray-strong, td.font-bold');
            if(!currentElement)continue;
            const stringElement = await page.$$eval('table[template-pagination="custom/pager/articulos"]  td.bg-gray-strong, td.font-bold',
            e => e.map(e => e.textContent.split('.')[0].trim()));
            for (let element = 0; element < currentElement.length; element++) {
                await currentElement[element].click();
                await timer();
                const documento = await page.evaluate(() => document.querySelector('span[ng-show="vm.currentItem.sLey.length"]').innerText);
                relaciones.push({documento,'relaciones':stringElement[element]});
            }
            pivote += currentElement.length;
            if(pivote < totalArticulos){
                await page.evaluate(()=> document.querySelectorAll('.icon-derecha')[1].parentElement.click());
                await timer();
            }
        }while(pivote < totalArticulos);
        const tesis= await page.evaluate(() => document.querySelector('.mCSB_container > b').nextSibling.textContent);
        arr.push({relaciones,'registro_digital':tesis.trim(),index});
    await page.evaluate(()=>document.querySelector('.icon-derecha').parentElement.click());
    await timer();
    await fs.writeFile(`relaciones-${materia}.json`,JSON.stringify(arr),null,3);
    }
    console.log('finalized');
}

async function startRequest(){
    const contenido = await fs.readFile('fichero-tesis-0.json');
    const response = await requestBatchProcess(contenido);
    if(response.status == 200) {
        console.log('La informacion llego correctamente');
    }
}

//openBrowser();
//weeklyRoutine();
//startingGetRelations();
//Se hace una tarea programada, para que cada 6to dia a las 23:59 se dispare el evento de recolectar las nuevas tesis de manera semanal
//cron.schedule('59 23 * * */6', () => weeklyRoutine());

//document.querySelectorAll('table[template-pagination="custom/pager/articulos"] > tbody > tr > td.bg-gray-strong, td.font-bold')
//.map(e => e.innerText).map(e => e.split('.')[0]).map(e=> e.trim());
//icon-derecha,
//icon-marcar-todo,
startRequest();