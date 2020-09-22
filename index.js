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
	fs.readdir(deckDirectory, (err, files) => {
		if (err) {
			console.log('There was an error reading the directory')
			logError(err.message)
		}

		const fileChoices = files.concat({ name: 'File not listed', value: 'notFound' })
		inquirer
			.prompt([
				{
					name: 'fileName',
					type: 'rawlist',
					message: 'Which file would you like to use to add cards to the deck?',
					choices: fileChoices,
				},
			])
			.then((answers) => {
				if (answers.fileName === 'notFound') {
					console.log('Add the csv file to import to the deck folder and try again.')
					return
				}
				readDeckFile(answers.fileName)
			})
			.catch((error) => {
				console.log(error.message)
			})
	})

	const readDeckFile = (fileName) => {
		console.log(`\nReading ${fileName}...\n`)
		const validCards = []
		const invalidCards = []
		//Create a file stream to read file line by line
		const stream = fs.createReadStream(path.join(deckDirectory, fileName))

		stream
			.on('error', (err) => {
				console.log(err.message)
				process.exit(1)
			})
			//Reads each line and imports as an object with keys as the row 1 column headers.
			.pipe(csvParser())
			.on('data', (row) => {
				//Checks that there are correct number of properties for row (6). If not, pushes to invalid array
				if (checkEmptyProperties(row)) {
					invalidCards.push(row)
				} else {
					validCards.push(row)
				}
			})
			.on('end', async () => {
				console.log(`Finished reading ${fileName}`)

				if (validCards.length === 0) {
					console.log('There are no valid cards to upload from ', fileName)
					return
				}
				if (await confirmUpload(validCards.length, invalidCards.length)) {
					addDeckToDatabase(validCards)
				} else {
					quit()
				}
				//Do you want to proceed and upload the {number} valid cards or quit the program?
			})
	}

	const checkEmptyProperties = (obj) => {
		let emptyProperties = false
		//Check if there are not exactly 6 properties on the object (word to guess + 5 words to avoid)
		if (Object.keys(obj).length !== 6) {
			emptyProperties = true
		} else {
			emptyProperties = Object.keys(obj).some(
				(key) => obj[key] === '' || obj[key] === 'undefined' || obj[key] === null
			)
		}
		return emptyProperties
	}

	const confirmUpload = (validCardCount, invalidCardCount) => {
		return inquirer
			.prompt([
				{
					name: 'continueUpload',
					type: 'list',
					choices: [
						{ name: 'proceed', value: true },
						{ name: 'cancel upload', value: false },
					],
					message: `There are ${invalidCardCount} invalid cards. Proceed to upload the ${validCardCount} valid cards?`,
				},
			])
			.then((answers) => {
				return answers.continueUpload
			})
			.catch((error) => {
				console.log(error.message)
			})
	}

	const addDeckToDatabase = (cardsToUpload) => {
		console.log('\nComparing existing cards...\n')
		const duplicateCards = []
		let filteredCardsToUpload
		//get entire cards collection, if it exists
		firebase
			.firestore()
			.collection('cards')
			.get()
			.then((deckSnapshot) => {
				console.log('check if there are duplicates\n')
				deckSnapshot.forEach((card, index) => {
					const cardData = card.data()

                    //card.id is the tabooWord. cardDate is the tabooList array
					if (checkForDuplicates(card.id, cardsToUpload)) {
						duplicateCards.push(card.id)
					}
				})

                console.log("duplicates array")
                console.log(duplicateCards)
                process.exit(0)
				//There are duplicates. Determine if should override existing cards

				//Check if deck already exists
				//No: continue
				//Yes: Check for duplicates
				//No duplicates: update deck
				//Duplicates: inquirer: There are duplicates. Select which of the following you want to override. Any unselected will not be updated.
				//Remove unselected duplicates from cardsToUpload
				//Upload remaining cards

				//Log success message
				//Update 'actions performed' array
			})
	}

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
	//log actions completed array to console and file
	process.exit(0)
}

const logError = (message, code = 1) => {
	console.log('')
	console.log(message)
	console.log('')
	process.exit(code)
}

const logActionsCompleted = () => {
	console.log('logging actions completed')
}

mainMenu(process.env.NODE_ENV)
