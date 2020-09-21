require('custom-env').env(`${process.env.NODE_ENV || 'development'}.local`, './')
const csvParser = require('csv-parser')
const fs = require('fs')
const path = require('path')
const inquirer = require('inquirer')
const firebase = require('firebase/app')
require('firebase/firestore')
require('firebase/analytics')

const fbConfig = require('./fbConfig')
// Initialize Firebase
firebase.initializeApp(fbConfig)

//Initialize firestore
firebase.firestore()

const mainMenu = () => {
	inquirer
		.prompt([
			{
				type: 'input',
				name: 'environmentConfirm',
				message: `PLEASE READ: All changes made will impact the ${process.env.NODE_ENV.toUpperCase()} database. To show you understand and intend to update the ${process.env.NODE_ENV.toUpperCase()} database, please type '${process.env.NODE_ENV}' and press enter.`,
				validate: (input) => {
					if (input.length === 0) {
						return "Type the environment name to proceed, or press 'Ctrl + C' to end the script"
					} else if (input !== process.env.NODE_ENV) {
						return "Input does not match environment name. Please type the exact environment name, or press 'Ctrl + C' to end the script with no changes made."
					} else {
						return true
					}
				},
			},
		])
		.then((response) => {
			console.log('success')
		})
		.catch((errpr) => {
			console.log(error.message)
		})
}

mainMenu(process.env.NODE_ENV)
