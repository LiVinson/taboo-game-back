require('dotenv').config()
const csvParser = require('csv-parser')
const fs = require('fs')
const path = require('path')
const firebase = require('firebase/app')
require('firebase/firestore')
const fbConfig = require('./fbConfig')

// Initialize Firebase
firebase.initializeApp(fbConfig)

//Initialize firestore
firebase.firestore()


const testFunc = () => {
	return firebase
		.firestore()
		.collection('games')
		.doc('84YOG0')
		.get()
		.then((game) => {
			if (!game.exists) throw new Error(`${gamecode} does not exist`)
			const gameInfo = game.data() //how data is accessed via firestore
			console.log(gameInfo)
		})
		.catch((error) => {
			console.log(error.message)
		})
}

testFunc()
