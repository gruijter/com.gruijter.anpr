# ANPR
## Licence plate recognition for Homey ##
Use snapshots from a camera connected to Homey, and let Platerecognizer do AI based licence plate recognition. For every plate the app detects, a flow will be triggered. The app will also provide vehicle type and region.

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/6/f/6f0957c6d850fb69e8c70c1838c33abe8027ca8a.jpeg" alt="ANPR" width="250">

## Use cases ##
* Presence detection
* Security
* Open garage door
* Fun

## Privacy ##
The Homey app uses a cloud based licence plate recognition service called Platerecognizer. Using the Platerecognizer service has privacy implications. Use at own risk. Read and understand your local privacy legislation, and the terms of use from Platerecognizer.

## Performance ##
The free Platerecognizer service allows you to upload around 8 images per second. The plate detection usually is ready within 1 to 3 seconds from uploading an image (via an action flowcard).

## Test image ##
To make testing your flow easier, a test image is available as global image token. It has license plates of two cars and a motor cycle.

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/3/a/3ad14d18b336841922871f43b577d74b1bdd893c.jpeg" alt="ANPR" width="250">

