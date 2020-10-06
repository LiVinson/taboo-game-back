require('custom-env').env(`${process.env.NODE_ENV || 'development'}.local`, './')
const csvParser = require('csv-parser')
const fs = require('fs')
const path = require('path')
const inquirer = require('inquirer')

//------------------Admin access to override any set rules in firestore ----------------//
const admin = require('firebase-admin')
const serviceAccount = require(process.env.KEY_PATH)
//initialize admin SDK using serviceAccountKey
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
})

//-------------Globals -----------------
const db = admin.firestore()
const deckDirectory = path.join(__dirname, 'deck')

/* ------------ Inquirer Prompts ------------ */
//Options for deck updates
const mainMenu = (environment) => {
	inquirer
		.prompt([
			{
				type: 'input',
				name: 'environmentConfirm',
				message: `PLEASE READ:\nAll changes made will impact the ${environment.toUpperCase()} database. To show you understand and intend to update the ${environment.toUpperCase()} database, please type '${environment}' and press enter.`,
				validate: (input) => {
					if (input.length === 0) {
						return "Type the environment name to proceed, or press 'Ctrl + C' to end the script"
					} else if (input !== environment) {
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
						name: 'Retrieve suggestion submissions',
						value: 'retrieveSuggestions',
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
				case 'retrieveSuggestions':
					determineSuggestionType()
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

const additionalActions = () => {
	inquirer
		.prompt([
			{
				name: 'continue',
				message: 'Perform additional actions?',
				type: 'list',
				choices: ['yes', 'no'],
			},
		])
		.then((response) => {
			if (response.continue === 'yes') {
				mainMenu(process.env.NODE_ENV)
			} else {
				quit()
			}
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
					invalidCards.push(row['0'])
				} else {
					validCards.push(row)
				}
			})
			.on('end', async () => {
				console.log(`Finished reading ${fileName}\n`)
				if (validCards.length === 0) {
					console.log('There are no valid cards to upload from ', fileName)
					return
				}
				if (await confirmUpload(validCards.length, invalidCards)) {
					addDeckToDatabase(validCards)
				} else {
					quit()
				}
				//Do you want to proceed and upload the {number} valid cards or quit the program?
			})
	}

	//Used to make sure objects created from csv all have 6 properties (word to guess + 5 words on tabooList) and none are empty
	const checkEmptyProperties = (obj) => {
		let emptyProperties = false
		if (Object.keys(obj).length !== 6) {
			emptyProperties = true
		} else {
			emptyProperties = Object.keys(obj).some(
				(key) => obj[key] === '' || obj[key] === 'undefined' || obj[key] === null
			)
		}
		return emptyProperties
	}

	//Used to confirm upload based on number of valid and invalid records read from csv
	const confirmUpload = (validCardCount, invalidCards) => {
		return inquirer
			.prompt([
				{
					name: 'continueUpload',
					type: 'list',
					choices: [
						{ name: 'proceed', value: true },
						{ name: 'cancel upload', value: false },
					],
					message: `There are ${invalidCards.length} invalid card(s):\n ${JSON.stringify(
						invalidCards
					)}\nProceed to upload the ${validCardCount} valid cards?\n`,
				},
			])
			.then((answers) => {
				return answers.continueUpload
			})
			.catch((error) => {
				console.log(error.message)
			})
	}

	//Reads existing deck to check for duplicates, confirm which duplicates to override before writing new cards
	const addDeckToDatabase = (cardsToUpload) => {
		console.log('\nComparing existing cards...\n')
		const duplicateCards = []
		let filteredCardsToUpload
		//get entire cards collection, if it exists
		db.collection('cards')
			.get()
			.then(async (deckSnapshot) => {
				deckSnapshot.forEach((card, index) => {
					// const cardData = card.data()

					//card.id is the tabooWord. Compares each existing card to see if there are duplicates with new list to upload
					if (checkForDuplicates(card.id, cardsToUpload)) {
						duplicateCards.push(card.id)
					}
				})

				//There are duplicates. Determine if should override existing cards
				if (duplicateCards.length > 0) {
					//array containing list of duplicate cards that should be overrided
					const duplicatesNotToOverride = await confirmDuplicateOverride(duplicateCards)
					console.log(duplicatesNotToOverride)
					console.log(duplicatesNotToOverride.length)
					//Don't override all duplicates, need to filter out cards listed in duplicatesNotToOverride from  cardsToUpload
					if (duplicatesNotToOverride.length > 0) {
						// 	//Updated cardsToUpload to remove any duplicates that are not in the  confirmedDuplicatesToOverride array
						filteredCardsToUpload = cardsToUpload.filter((card) => {
							//if card is  in do not duplicate list, filter it out so it is not uploaded
							return !duplicatesNotToOverride.includes(card.tabooWord)
						})
					} else {
						//override all
						filteredCardsToUpload = cardsToUpload
					}
				} else {
					//No duplicates, so upload the full list from the csv
					console.log('No duplicates detected.\n')
					// no duplicates
					filteredCardsToUpload = cardsToUpload
				}

				console.log(`Batch adding ${filteredCardsToUpload.length} card(s)...`)
				const formattedCardsToUpload = filteredCardsToUpload.map((card) => {
					const tabooList = [card.word1, card.word2, card.word3, card.word4, card.word5]
					return {
						tabooWord: card.tabooWord,
						tabooList: tabooList,
					}
				})

				const batch = db.batch()

				formattedCardsToUpload.forEach((card) => {
					const cardRef = db.collection('cards').doc(card.tabooWord)
					batch.set(cardRef, { tabooList: [...card.tabooList] })
				})

				batch
					.commit()
					.then(() => {
						console.log(`\nDone! Added or updated ${formattedCardsToUpload.length} cards!\n`)
						additionalActions()
					})
					.catch((error) => {
						console.log('error on batch update')
						console.log(error)
					})
			})
			.catch((error) => {
				console.log(error.message)
			})
	}
	//returns true if existing word is included in the array of cards to be uploaded
	const checkForDuplicates = (existingWord, cardsToUpload) => {
		return cardsToUpload.some((newCard) => existingWord === newCard.tabooWord)
	}

	const confirmDuplicateOverride = (duplicatesList) => {
		console.log('Duplicates Detected!\n')
		const formattedDuplicates = duplicatesList.map((word, index) => {
			const updatedCard = {
				name: `${index + 1}. ${word}`,
				value: word,
			}
			return updatedCard
		})

		return inquirer
			.prompt([
				{
					type: 'checkbox',
					name: 'dontOverrideList',
					message: `\n${duplicatesList.length} card(s) to be uploaded already exist in the database. Select the cards you DO NOT wish to override or press enter to override all cards listed.`,
					choices: formattedDuplicates,
				},
			])
			.then((answers) => {
				return answers.dontOverrideList
			})
			.catch((error) => {
				console.log(error.message)
				process.exit(1)
			})
	}
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

const determineSuggestionType = () => {
	inquirer
		.prompt([
			{
				type: 'list',
				message: 'Which suggestions would you like to retrieve?',
				name: 'suggestionType',
				choices: [
					{
						name: 'new suggestions',
						value: false,
					},
					{
						name: 'all suggestions',
						value: true,
					},
				],
			},
		])
		.then((response) => {
			logSuggestionByType(response.suggestionType)
		})
}

const logSuggestionByType = (getAllSuggestions) => {
	console.log('get all suggestions?: ', getAllSuggestions)
	const dbQuery = getAllSuggestions
		? db.collection('suggestions')
		: db.collection('suggestions').where('reviewed', '==', false)

	dbQuery
		.get()
		.then((suggestionsSnapshot) => {
			const suggestions = []
			suggestionsSnapshot.forEach((suggestionSnapshot) => {
				const suggestion = suggestionSnapshot.data()
				suggestions.push({
					tabooWord: suggestion.tabooWord,
					tabooList: suggestion.tabooList,
				})
			})

			if (suggestions.length > 0) {
				determineSuggestionAction(suggestions)
			} else {
				console.log('There were no suggestions to retrieve that meet the specifications\n')
				mainMenu(process.env.NODE_ENV)
			}
		})
		.catch((err) => {
			console.log(err.message)
		})
}

const determineSuggestionAction = (suggestionList) => {
	inquirer
		.prompt([
			{
				type: 'list',
				name: 'suggestionAction',
				message: `${suggestionList.length} suggested card(s) were retrieved. What action would you like to take?`,
				choices: [
					{
						name: 'Print all suggestions to the terminal',
						value: 'printAll',
					},
					{ name: `Add suggestions to existing csv file`, value: 'updateExistingCsv' },
					{ name: `Add suggestions to new csv file`, value: 'addNewCsv' },
					{ name: 'Update status to reviewed = true', value: 'updateReview' },
					{ name: `Return to main menu`, value: 'mainMenu' },
					{ name: `Quit with no additional actions`, value: 'quit' },
				],
			},
		])
		.then((response) => {
			switch (response.suggestionAction) {
				case 'printAll':
					printAllSuggestions(suggestionList)
					break
				case 'updateExistingCsv':
					chooseCsvForUpdate(suggestionList)
					break
				case 'addNewCsv':
					addToNewCsv(suggestionList)
					break
				case 'updateReview':
					updateReview(suggestionList)
					break
				case 'mainMenu':
					mainMenu(process.env.NODE_ENV)
					break
				case 'quit':
					quit()
				default:
			}
		})
}

const printAllSuggestions = (suggestionList) => {
	console.log('print all')
	console.table(suggestionList)

	setTimeout(() => {
		determineSuggestionAction(suggestionList)
	}, 1500)
}

const chooseCsvForUpdate = (suggestionList) => {
	console.log('choose csv for update')
}

addToNewCsv = (suggestionList) => {
	console.log('add to new csv')
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
