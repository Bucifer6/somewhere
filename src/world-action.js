// The only mutation surface offered to the creative MCP. No code execution,
// filesystem paths, URLs, arbitrary JSON patches, external calls or deployments.
const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(["create_event","introduce_character","start_project"]);
const MAX_DAILY_ACTIONS=8;
const MAX_TOTAL_ACTIONS=2048;
const MAX_PEOPLE=32;
const MAX_PROJECTS=12;
const MAX_EVENTS=200;

function safeText(value,max) {
  return typeof value==="string" && value.length>=3 && value.length<=max &&
    !/[\u0000-\u001f\u007f<>]/u.test(value) && value.trim()===value &&
    !/https?:\/\//i.test(value);
}
export function validateWorldAction(input) {
  if (!input || typeof input!=="object" || Array.isArray(input)) throw Error("Action object required");
  if (!ACTIONS.has(input.action)) throw Error("Unsupported creative action");
  if (typeof input.requestId!=="string" || !REQUEST_ID.test(input.requestId)) throw Error("UUID requestId required");
  const keys={
    create_event:["action","requestId","title","story"],
    introduce_character:["action","requestId","name","description"],
    start_project:["action","requestId","name","description"]
  }[input.action];
  if (Object.keys(input).sort().join("|")!==keys.sort().join("|")) throw Error("Unknown or missing action fields");
  if (input.action==="create_event") {
    if (!safeText(input.title,80) || !safeText(input.story,400)) throw Error("Invalid event content");
  } else if (!safeText(input.name,60) || !safeText(input.description,250)) throw Error("Invalid creative content");
  return Object.fromEntries(keys.map(k=>[k,input[k]]));
}
export function applyWorldAction(world,input,now=new Date()) {
  const action=validateWorldAction(input);
  if (!Number.isSafeInteger(world?.day) || world.day<1 ||
      !Array.isArray(world?.inhabitants) || !Array.isArray(world?.events)) throw Error("World not ready");
  const existing=Array.isArray(world.creativeActionIds)?world.creativeActionIds:[];
  if (existing.includes(action.requestId)) return {world,result:{requestId:action.requestId,status:"already-applied",action:action.action}};
  if (existing.length>=MAX_TOTAL_ACTIONS) throw Error("Creative action registry full; human archive required");
  const daily=world.creativeActionDay===world.day?world.creativeActionsToday??0:0;
  if (!Number.isSafeInteger(daily) || daily<0 || daily>=MAX_DAILY_ACTIONS) throw Error("Daily creative action limit reached");
  const next=structuredClone(world);
  const eventId="creative-"+action.requestId;
  if (action.action==="create_event"){
    next.events.unshift({id:eventId,day:world.day,kind:"creative",title:action.title,text:action.story});
  } else if(action.action==="introduce_character"){
    if(next.inhabitants.length>=MAX_PEOPLE) throw Error("Inhabitant limit reached");
    const nameKey=action.name.toLocaleLowerCase("en");
    if(next.inhabitants.some(p=>p.name?.toLocaleLowerCase("en")===nameKey)) throw Error("Character name already exists");
    next.inhabitants.push({id:"creative-person-"+action.requestId,name:action.name,
      description:action.description,x:48,y:52,mood:"curious"});
    next.events.unshift({id:eventId,day:world.day,kind:"arrival",text:action.name+" arrived in Hearth. "+action.description});
    if(next.settlements?.[0] && Number.isSafeInteger(next.settlements[0].population)) next.settlements[0].population+=1;
  } else {
    const projects=Array.isArray(next.projects)?next.projects:[];
    if(projects.length>=MAX_PROJECTS) throw Error("Project registry full");
    const duplicate=projects.some(p=>p.name?.toLocaleLowerCase("en")===action.name.toLocaleLowerCase("en"));
    if(duplicate) throw Error("Project name already exists");
    next.projects=[...projects,{id:"creative-project-"+action.requestId,kind:"creative",name:action.name,
      description:action.description,goal:8,progress:0,startedDay:world.day,completedDay:null,contributors:[]}];
    next.events.unshift({id:eventId,day:world.day,kind:"project",text:"Hearth began a new dream: "+action.name+". "+action.description});
  }
  next.events=next.events.slice(0,MAX_EVENTS);
  next.creativeActionIds=[...existing,action.requestId];
  next.creativeActionDay=world.day;
  next.creativeActionsToday=daily+1;
  next.updatedAt=now.toISOString();
  return {world:next,result:{requestId:action.requestId,status:"applied",action:action.action,day:world.day,eventId}};
}
