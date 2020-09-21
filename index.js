require('custom-env').env(`${process.env.NODE_ENV || 'development'}.local`, './')
const csvParser = require('csv-parser')
const fs = require('fs')
const path = require('path')
const inquirer = require('inquirer')
//---------Firebase configuration--------------
const firebase = require('firebase/app')
require('firebase/firestore')
require('firebase/analytics')
const fbConfig = require('./config/fbConfig')
// Initialize Firebase
firebase.initializeApp(fbConfig)

//Initialize firestore
firebase.firestore()

//-------------Globals -----------------

const deckDirectory = path.join(__dirname, 'deck')
const mainMenu = () => {
	inquirer
		.prompt([
			{
				type: 'input',
				name: 'environmentConfirm',
				message: `PLEASE READ: All changes made will impact the ${process.env.NODE_ENV.toUpperCase()} database. To show you understand and intend to update the ${process.env.NODE_ENV.toUpperCase()} database, please type '${
					process.env.NODE_ENV
				}' and press enter.`,
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
			{
				type: 'rawlist',
				name: 'menuAction',
				message: `What would you like to do?`,
				choices: [
					{
						name: 'Import new cards from a file',
						value: 'newFile',
					},
					{
						name: 'Update existing cards in the deck',
						value: 'update',
					},
					{
						name: 'Remove a card from the deck',
						value: 'removeCard',
					},
					{
						name: 'Delete the entire deck',
						value: 'deleteDeck',
					},
					{
						name: 'Print list of existing cards',
						value: 'logExisting',
					},
					{
						name: 'Print list of card suggestions',
						value: 'logSuggestions',
					},
					{
						name: 'Quit',
						value: 'quit',
					},
				],
			},
		])
		.then((response) => {
			console.log('success')
			console.log(response)
			switch (response.menuAction) {
				case 'newFile':
					importCardsFromFile()
					return
				case 'update':
					updateExistingCard()
					return
				case 'removeCard':
					removeCardFromDeck()
					return
				case 'deleteDeck':
					deleteDeck()
					return
				case 'logExisting':
					logExistingCards()
					return
				case 'logSuggestions':
					logCardSuggestions()
					return
				case 'quit':
					quit()
					return
				default:
					console.log('something went wrong')
					return
			}
		})
		.catch((error) => {
			console.log(error.message)
		})
}

const importCardsFromFile = () => {
	console.log('File must be a csv and saved in the deck folder.')
	fs.readdir(deckDirectory, (err, files) => {
		if (err) {
			console.log('There was an error reading the directory')
			logError(err.message)
		}

		const fileChoices = files.concat({ name: 'File not listed', value: 'notFound' })
		console.log(fileChoices)
		inquirer
			.prompt([
				{
					name: 'fileName',
					type: 'rawlist',
					message: 'Which file would you like to import?',
					choices: fileChoices,
				},
			])
			.then((answers) => {
                console.log(answers)
				if (answers.fileName === 'notFound') {
					console.log('Add the csv file to import to the deck folder and try again.')
					return
				}
				console.log('importing ', answers.fileName)
			})
			.catch((error) => {
				console.log(error.message)
			})
	})

	/*
    
    Name of file w/ extenstion
    Check that file exists with valid extension
    Log: File exists. Reading contents
    //Reading complete.
    //Number of valid and invalid cards
    //Review list of valid or invalid before import?
    //Import cards
    //Success message. New number of cards.
    //Update 'actionsPerformed' array?
    //What would you like to do
    //Quit
    //Log actions performed 
    

*/
}

const updateExistingCard = () => {
	console.log('update existing card')
}

const removeCardFromDeck = () => {
	console.log('remove from deck')
}

const deleteDeck = () => {
	console.log('delete deck')
}

const logExistingCards = () => {
	console.log('log existing cards')
}

const logCardSuggestions = () => {
	console.log('log card suggestions')
}

const quit = () => {
	console.log('quit')
}

const logError = (message, code = 1) => {
	console.log('')
	console.log(message)
	console.log('')
	process.exit(code)
}
mainMenu(process.env.NODE_ENV)
