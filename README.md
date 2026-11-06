# AI Smart Security Patrol Car: Dashboard

Web control dashboard for the AI Smart Security Patrol Car, a security robot that combines robotics, AI and computer vision.

## What the dashboard shows

- **Live camera feed**
- **AI detection** panel
- **Core telemetry**
- **Sensor panels:** DHT22 temperature and humidity, MQ-9 gas sensor, flame sensor, motion and sound
- **GPS location** (Neo-6M) and **GSM / SMS** alerts (SIM800L)
- **Manual controls** for driving the car
- **System logs** and configuration

The page talks to the robot's gateway over HTTP (`fetch`), so the gateway address is set in the configuration panel.

## The robot

- Arduino UNO and ESP32-CAM
- Python and OpenCV for face recognition and object detection
- Ultrasonic sensors for obstacle avoidance and movement control

## Tech

HTML5, CSS3, JavaScript

## Run

Open `index.html` in a browser on a device that can reach the robot's network.

## Author

Mahmoud Badea Elzaman, Faculty of Computers and Information, Kafrelsheikh University.
