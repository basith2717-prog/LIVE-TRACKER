import asyncio
import math
import random
import time
from typing import List, Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch background simulation engine
    sim_task = asyncio.create_task(simulation_engine())
    yield
    # Shutdown
    sim_task.cancel()

app = FastAPI(title="CivicCare - Public Complaint Live Tracking System", lifespan=lifespan)

# Static & Templates setup
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# Connected WebSocket clients
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# Global Simulation State
SIMULATION_CONFIG = {
    "is_paused": False,
    "speed_multiplier": 1.0,  # 1x, 2x, 5x, 10x
    "update_interval": 1.0     # seconds
}

# High Urgency Geofence Zones (Auto-escalation regions)
URGENCY_ZONES = [
    {
        "id": "zone_hospital",
        "name": "General Hospital Core (Critical Escalation)",
        "center": [37.7850, -122.4050],
        "radius_meters": 600,
        "type": "CRITICAL"
    },
    {
        "id": "zone_school",
        "name": "Mission District School Zone (High Escalation)",
        "center": [37.7600, -122.4200],
        "radius_meters": 500,
        "type": "HIGH"
    }
]

# Initial mock datasets
def create_initial_complaints() -> List[Dict[str, Any]]:
    return [
        {
            "id": "CP-1001",
            "title": "Severe Market St Pothole",
            "category": "pothole",
            "description": "Deep pothole in center lane. Damaging tires.",
            "lat": 37.7790,
            "lng": -122.4150,
            "status": "RESOLVED",
            "urgency": "MEDIUM",
            "reporter": "Marcus Vance",
            "created_at": "10:15:30",
            "assigned_crew_id": "CREW-01",
            "history": [
                "10:15:30 - Reported by Marcus Vance.",
                "10:17:10 - Dispatched Road Maintenance Crew A.",
                "10:20:45 - Crew arrived on site.",
                "10:28:15 - Pothole filled and sealed. Resolved."
            ]
        },
        {
            "id": "CP-1002",
            "title": "Dark Streetlamp 4th St",
            "category": "lighting",
            "description": "Entire block is dark, streetlight bulb seems burnt out.",
            "lat": 37.7850,
            "lng": -122.4010,
            "status": "RESOLVED",
            "urgency": "LOW",
            "reporter": "Elena Rostova",
            "created_at": "10:22:15",
            "assigned_crew_id": "CREW-03",
            "history": [
                "10:22:15 - Reported by Elena Rostova.",
                "10:24:00 - Dispatched Grid Electricians Beta.",
                "10:28:30 - Crew arrived on site.",
                "10:33:02 - Bulb replaced and line tested. Resolved."
            ]
        },
        {
            "id": "CP-1003",
            "title": "Burst Water Main Folsom St",
            "category": "water",
            "description": "Water leaking rapidly onto sidewalk and road. Low pressure nearby.",
            "lat": 37.7760,
            "lng": -122.4080,
            "status": "IN_PROGRESS",
            "urgency": "HIGH",
            "reporter": "Sarah Chen",
            "created_at": "10:35:00",
            "assigned_crew_id": "CREW-04",
            "history": [
                "10:35:00 - Reported by Sarah Chen.",
                "10:36:12 - Dispatched Municipal Water Works.",
                "10:41:00 - Crew arrived. Shutting off main valve."
            ]
        },
        {
            "id": "CP-1004",
            "title": "Blocked Hydrant at Mission St",
            "category": "parking",
            "description": "Commercial truck parked in front of fire hydrant.",
            "lat": 37.7600,
            "lng": -122.4200,
            "status": "ASSIGNED",
            "urgency": "HIGH",  # Escalate because it matches the school geofence zone!
            "reporter": "Officer Jim",
            "created_at": "10:42:00",
            "assigned_crew_id": "CREW-05",
            "history": [
                "10:42:00 - Reported by Officer Jim in Mission School Zone (Auto-Escalated Urgency).",
                "10:42:45 - Dispatched Rapid Response Team."
            ]
        },
        {
            "id": "CP-1005",
            "title": "Overflowing Trash Can 16th St",
            "category": "sanitation",
            "description": "Public garbage bin overflowing with commercial waste.",
            "lat": 37.7650,
            "lng": -122.4180,
            "status": "PENDING",
            "urgency": "LOW",
            "reporter": "John Doe",
            "created_at": "10:44:00",
            "assigned_crew_id": None,
            "history": [
                "10:44:00 - Reported by John Doe. Awaiting dispatch."
            ]
        },
        {
            "id": "CP-1006",
            "title": "Broken Light at Dolores Park",
            "category": "lighting",
            "description": "Pathway lamp shattered, exposed wiring.",
            "lat": 37.7600,
            "lng": -122.4350,
            "status": "PENDING",
            "urgency": "MEDIUM",
            "reporter": "Aria Stark",
            "created_at": "10:45:10",
            "assigned_crew_id": None,
            "history": [
                "10:45:10 - Reported by Aria Stark. Awaiting dispatch."
            ]
        }
    ]

def create_initial_crews() -> List[Dict[str, Any]]:
    return [
        {
            "id": "CREW-01",
            "name": "Road Maintenance Crew A",
            "type": "pothole",
            "lat": 37.7749,
            "lng": -122.4194,
            "target_lat": 37.7749,
            "target_lng": -122.4194,
            "speed": 0.0,
            "max_speed": 55.0,
            "heading": 0.0,
            "fuel": 84.0,
            "status": "IDLE",
            "assigned_complaint_id": None,
            "progress": 0.0,
            "history": [],
            "resolving_timer": 0.0
        },
        {
            "id": "CREW-02",
            "name": "Sanitation Dispatch 3",
            "type": "sanitation",
            "lat": 37.8080,
            "lng": -122.4170,
            "target_lat": 37.8080,
            "target_lng": -122.4170,
            "speed": 0.0,
            "max_speed": 50.0,
            "heading": 0.0,
            "fuel": 91.0,
            "status": "IDLE",
            "assigned_complaint_id": None,
            "progress": 0.0,
            "history": [],
            "resolving_timer": 0.0
        },
        {
            "id": "CREW-03",
            "name": "Grid Electricians Beta",
            "type": "lighting",
            "lat": 37.7850,
            "lng": -122.4010,
            "target_lat": 37.7850,
            "target_lng": -122.4010,
            "speed": 0.0,
            "max_speed": 60.0,
            "heading": 0.0,
            "fuel": 72.0,
            "status": "IDLE",
            "assigned_complaint_id": None,
            "progress": 0.0,
            "history": [],
            "resolving_timer": 0.0
        },
        {
            "id": "CREW-04",
            "name": "Municipal Water Works",
            "type": "water",
            "lat": 37.7760,
            "lng": -122.4080,
            "target_lat": 37.7760,
            "target_lng": -122.4080,
            "speed": 0.0,
            "max_speed": 50.0,
            "heading": 0.0,
            "fuel": 61.0,
            "status": "RESOLVING",
            "assigned_complaint_id": "CP-1003",
            "progress": 1.0,
            "history": [],
            "resolving_timer": 15.0  # seconds left to resolve
        },
        {
            "id": "CREW-05",
            "name": "Rapid Response Team",
            "type": "parking",  # general fallback/parking response crew
            "lat": 37.7749,
            "lng": -122.4194,
            "target_lat": 37.7600,
            "target_lng": -122.4200,
            "speed": 45.0,
            "max_speed": 65.0,
            "heading": 210.0,
            "fuel": 88.0,
            "status": "RESPONDING",
            "assigned_complaint_id": "CP-1004",
            "progress": 0.0,
            "history": [],
            "resolving_timer": 0.0
        }
    ]

COMPLAINTS: List[Dict[str, Any]] = create_initial_complaints()
CREWS: List[Dict[str, Any]] = create_initial_crews()
SYSTEM_LOGS: List[Dict[str, Any]] = []

def add_log(event_type: str, message: str, complaint_id: str = None):
    log_entry = {
        "timestamp": time.strftime("%H:%M:%S"),
        "type": event_type,
        "message": message,
        "complaint_id": complaint_id
    }
    SYSTEM_LOGS.insert(0, log_entry)
    if len(SYSTEM_LOGS) > 50:
        SYSTEM_LOGS.pop()

add_log("SYSTEM", "CivicCare Live Complaint Dispatch Server Active.")

# Geographic Helper Math
def calculate_bearing(lat1, lng1, lat2, lng2):
    rad_lat1 = math.radians(lat1)
    rad_lat2 = math.radians(lat2)
    diff_lng = math.radians(lng2 - lng1)
    x = math.sin(diff_lng) * math.cos(rad_lat2)
    y = math.cos(rad_lat1) * math.sin(rad_lat2) - (math.sin(rad_lat1) * math.cos(rad_lat2) * math.cos(diff_lng))
    initial_bearing = math.atan2(x, y)
    initial_bearing = math.degrees(initial_bearing)
    compass_bearing = (initial_bearing + 360) % 360
    return compass_bearing

def haversine_distance(lat1, lng1, lat2, lng2):
    R = 6371000  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# Dynamic movement towards coordinates
def move_towards(curr_lat, curr_lng, target_lat, target_lng, speed_kmh, dt):
    dist = haversine_distance(curr_lat, curr_lng, target_lat, target_lng)
    
    # If closer than 15 meters, we have arrived
    if dist < 15.0:
        return target_lat, target_lng, 0.0, True
        
    bearing = calculate_bearing(curr_lat, curr_lng, target_lat, target_lng)
    bearing_rad = math.radians(bearing)
    
    # speed is in km/h. Convert step size to meters
    step_m = (speed_kmh / 3.6) * dt
    
    if step_m >= dist:
        return target_lat, target_lng, 0.0, True
        
    # Degrees approximation
    delta_lat = (step_m * math.cos(bearing_rad)) / 111139.0
    lat_rad = math.radians(curr_lat)
    delta_lng = (step_m * math.sin(bearing_rad)) / (111139.0 * math.cos(lat_rad))
    
    return curr_lat + delta_lat, curr_lng + delta_lng, bearing, False

# Simulation loop background task
async def simulation_engine():
    while True:
        await asyncio.sleep(SIMULATION_CONFIG["update_interval"])
        
        if SIMULATION_CONFIG["is_paused"]:
            continue

        mult = SIMULATION_CONFIG["speed_multiplier"]
        dt = SIMULATION_CONFIG["update_interval"] * mult

        # 1. Dispatch System: Assign PENDING complaints to compatible IDLE crews
        for c in COMPLAINTS:
            if c["status"] != "PENDING":
                continue
                
            # Find closest matching idle crew
            best_crew = None
            min_dist = float('inf')
            
            for crew in CREWS:
                if crew["status"] != "IDLE":
                    continue
                # Match type, or CREW-05 (Rapid Response) as fallback
                if crew["type"] == c["category"] or crew["id"] == "CREW-05":
                    dist = haversine_distance(crew["lat"], crew["lng"], c["lat"], c["lng"])
                    if dist < min_dist:
                        min_dist = dist
                        best_crew = crew
            
            if best_crew:
                # Dispatch!
                c["status"] = "ASSIGNED"
                c["assigned_crew_id"] = best_crew["id"]
                c["history"].append(f"{time.strftime('%H:%M:%S')} - Dispatched {best_crew['name']}.")
                
                best_crew["status"] = "RESPONDING"
                best_crew["assigned_complaint_id"] = c["id"]
                best_crew["target_lat"] = c["lat"]
                best_crew["target_lng"] = c["lng"]
                best_crew["speed"] = random.uniform(40.0, 55.0)
                best_crew["resolving_timer"] = random.randint(8, 15)  # steps needed onsite
                
                add_log("DISPATCH", f"{best_crew['name']} dispatched to {c['id']}: {c['title']}", c["id"])

        # 2. Movement & Resolution Processing for Crews
        for crew in CREWS:
            if crew["status"] == "IDLE":
                # Very slow drift speed reduction or recharge
                crew["fuel"] = min(100.0, round(crew["fuel"] + 0.05 * mult, 1))
                continue
                
            if crew["status"] == "RESPONDING":
                new_lat, new_lng, heading, reached = move_towards(
                    crew["lat"], crew["lng"], 
                    crew["target_lat"], crew["target_lng"], 
                    crew["speed"], dt
                )
                
                crew["lat"] = round(new_lat, 6)
                crew["lng"] = round(new_lng, 6)
                if heading != 0.0:
                    crew["heading"] = round(heading, 1)
                    
                crew["fuel"] = max(0.0, round(crew["fuel"] - 0.02 * dt, 1))
                
                # Append to breadcrumbs
                crew["history"].append({
                    "lat": crew["lat"],
                    "lng": crew["lng"],
                    "speed": round(crew["speed"], 1),
                    "timestamp": time.strftime("%H:%M:%S")
                })
                if len(crew["history"]) > 40:
                    crew["history"].pop(0)
                    
                if reached:
                    # Crew has arrived
                    crew["status"] = "RESOLVING"
                    crew["speed"] = 0.0
                    
                    comp_id = crew["assigned_complaint_id"]
                    for c in COMPLAINTS:
                        if c["id"] == comp_id:
                            c["status"] = "IN_PROGRESS"
                            c["history"].append(f"{time.strftime('%H:%M:%S')} - Crew arrived on site. Commencing resolution.")
                            add_log("SYSTEM", f"{crew['name']} arrived at site of {c['id']}", c["id"])
                            
            elif crew["status"] == "RESOLVING":
                # Decrement onsite resolving time
                crew["resolving_timer"] = max(0.0, crew["resolving_timer"] - dt)
                
                if crew["resolving_timer"] <= 0.0:
                    # Finished resolving the complaint
                    comp_id = crew["assigned_complaint_id"]
                    for c in COMPLAINTS:
                        if c["id"] == comp_id:
                            c["status"] = "RESOLVED"
                            c["history"].append(f"{time.strftime('%H:%M:%S')} - Resolved by {crew['name']}.")
                            add_log("SYSTEM", f"Issue {c['id']} fully resolved by {crew['name']}.", c["id"])
                            
                    # Set crew to IDLE
                    crew["status"] = "IDLE"
                    crew["assigned_complaint_id"] = None
                    crew["target_lat"] = crew["lat"]
                    crew["target_lng"] = crew["lng"]
                    crew["speed"] = 0.0

        # 3. Broadcast updates over WebSocket
        payload = {
            "type": "TELEMETRY_UPDATE",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "complaints": COMPLAINTS,
            "crews": CREWS,
            "logs": SYSTEM_LOGS[:20],
            "config": SIMULATION_CONFIG
        }
        await manager.broadcast(payload)


# Page routes
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(
        request=request, 
        name="index.html", 
        context={"complaints": COMPLAINTS, "crews": CREWS, "geofences": URGENCY_ZONES}
    )


# REST Endpoints
@app.get("/api/complaints")
async def get_complaints():
    return {"complaints": COMPLAINTS, "count": len(COMPLAINTS)}

@app.get("/api/complaints/{complaint_id}")
async def get_complaint(complaint_id: str):
    for c in COMPLAINTS:
        if c["id"] == complaint_id:
            return c
    raise HTTPException(status_code=404, detail="Complaint not found")

class ComplaintReportRequest(BaseModel):
    title: str
    category: str
    description: str
    urgency: str
    reporter: str
    lat: float
    lng: float

@app.post("/api/complaints")
async def report_complaint(req: ComplaintReportRequest):
    # Check geofences (hospital/school zones) for escalation
    final_urgency = req.urgency
    escalated = False
    escalation_message = ""
    
    for zone in URGENCY_ZONES:
        dist = haversine_distance(req.lat, req.lng, zone["center"][0], zone["center"][1])
        if dist <= zone["radius_meters"]:
            # Auto escalate
            if zone["type"] == "CRITICAL":
                final_urgency = "CRITICAL"
                escalation_message = f"Auto-Escalated to CRITICAL in Hospital Core."
                escalated = True
            elif zone["type"] == "HIGH" and final_urgency in ["LOW", "MEDIUM"]:
                final_urgency = "HIGH"
                escalation_message = f"Auto-Escalated to HIGH in School Zone."
                escalated = True
                
    # Create new complaint ID
    new_id = f"CP-{random.randint(1007, 9999)}"
    
    history_entry = f"{time.strftime('%H:%M:%S')} - Reported by {req.reporter}."
    if escalated:
        history_entry += f" {escalation_message}"
        
    complaint = {
        "id": new_id,
        "title": req.title,
        "category": req.category,
        "description": req.description,
        "lat": round(req.lat, 6),
        "lng": round(req.lng, 6),
        "status": "PENDING",
        "urgency": final_urgency,
        "reporter": req.reporter,
        "created_at": time.strftime("%H:%M:%S"),
        "assigned_crew_id": None,
        "history": [history_entry]
    }
    
    COMPLAINTS.append(complaint)
    add_log("REPORT", f"New complaint reported: {complaint['title']} ({complaint['id']})", complaint["id"])
    if escalated:
        add_log("WARNING", f"Complaint {complaint['id']} escalated: {escalation_message}", complaint["id"])
        
    # Trigger immediate WS update broadcast
    payload = {
        "type": "TELEMETRY_UPDATE",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "complaints": COMPLAINTS,
        "crews": CREWS,
        "logs": SYSTEM_LOGS[:20],
        "config": SIMULATION_CONFIG
    }
    await manager.broadcast(payload)
    
    return {"status": "success", "complaint": complaint}

@app.get("/api/crews")
async def get_crews():
    return {"crews": CREWS, "count": len(CREWS)}

class ControlRequest(BaseModel):
    is_paused: bool = None
    speed_multiplier: float = None

@app.post("/api/simulation/control")
async def control_simulation(req: ControlRequest):
    if req.is_paused is not None:
        SIMULATION_CONFIG["is_paused"] = req.is_paused
        status_str = "PAUSED" if req.is_paused else "RESUMED"
        add_log("CONTROL", f"Simulation state set to {status_str}")
    if req.speed_multiplier is not None:
        SIMULATION_CONFIG["speed_multiplier"] = max(0.5, min(10.0, req.speed_multiplier))
        add_log("CONTROL", f"Simulation speed changed to {SIMULATION_CONFIG['speed_multiplier']}x")
        
    # Trigger immediate update
    payload = {
        "type": "TELEMETRY_UPDATE",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "complaints": COMPLAINTS,
        "crews": CREWS,
        "logs": SYSTEM_LOGS[:20],
        "config": SIMULATION_CONFIG
    }
    await manager.broadcast(payload)
    return SIMULATION_CONFIG

@app.get("/api/analytics")
async def get_analytics():
    total = len(COMPLAINTS)
    pending = sum(1 for c in COMPLAINTS if c["status"] == "PENDING")
    assigned = sum(1 for c in COMPLAINTS if c["status"] == "ASSIGNED")
    in_progress = sum(1 for c in COMPLAINTS if c["status"] == "IN_PROGRESS")
    resolved = sum(1 for c in COMPLAINTS if c["status"] == "RESOLVED")
    active_crews = sum(1 for v in CREWS if v["status"] != "IDLE")
    
    satisfaction = 100
    if total > 0:
        satisfaction = int(100 * (resolved / total) + 20 * (in_progress + assigned) / total)
        satisfaction = max(30, min(100, satisfaction))
        
    return {
        "total_complaints": total,
        "pending_count": pending,
        "assigned_count": assigned,
        "in_progress_count": in_progress,
        "resolved_count": resolved,
        "active_crews": active_crews,
        "satisfaction_score": satisfaction
    }

# WebSocket connection endpoint
@app.websocket("/ws/tracking")
async def websocket_tracking(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        initial_payload = {
            "type": "INITIAL_STATE",
            "complaints": COMPLAINTS,
            "crews": CREWS,
            "geofences": URGENCY_ZONES,
            "logs": SYSTEM_LOGS[:20],
            "config": SIMULATION_CONFIG
        }
        await websocket.send_json(initial_payload)
        
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "TOGGLE_PAUSE":
                SIMULATION_CONFIG["is_paused"] = not SIMULATION_CONFIG["is_paused"]
                add_log("CONTROL", f"Simulation {'PAUSED' if SIMULATION_CONFIG['is_paused'] else 'RESUMED'} via WS")
            elif action == "SET_SPEED":
                val = float(data.get("value", 1.0))
                SIMULATION_CONFIG["speed_multiplier"] = max(0.5, min(10.0, val))
                add_log("CONTROL", f"Speed set to {val}x via WS")
            elif action == "RESET":
                COMPLAINTS.clear()
                COMPLAINTS.extend(create_initial_complaints())
                CREWS.clear()
                CREWS.extend(create_initial_crews())
                SYSTEM_LOGS.clear()
                add_log("SYSTEM", "Live Tracking Server Reset.")
                
            # Broadcast state update immediately after action
            payload = {
                "type": "TELEMETRY_UPDATE",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "complaints": COMPLAINTS,
                "crews": CREWS,
                "logs": SYSTEM_LOGS[:20],
                "config": SIMULATION_CONFIG
            }
            await manager.broadcast(payload)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
